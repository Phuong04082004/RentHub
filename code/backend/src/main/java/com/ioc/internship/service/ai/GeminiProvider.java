package com.ioc.internship.service.ai;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestTemplate;

import java.util.*;

@Service
@RequiredArgsConstructor
@Slf4j
public class GeminiProvider implements AIProvider {

    @Value("${app.ai.gemini.api-key}")
    private String apiKey;

    @Value("${app.ai.gemini.model:gemini-2.5-flash}")
    private String model;

    @Value("${app.ai.gemini.timeout-ms:30000}")
    private int timeoutMs;

    private final ObjectMapper objectMapper;

    @Override
    public String getModelName() {
        return model;
    }

    @Override
    public AIProviderResponse generateResponse(List<AiChatMessageDto> messages, String systemInstruction, List<AITool> tools) {
        String effectiveApiKey = (apiKey != null && !apiKey.trim().isEmpty() && !apiKey.startsWith("${")) 
                ? apiKey.trim() 
                : System.getenv("GEMINI_API_KEY");
                
        if (effectiveApiKey == null || effectiveApiKey.trim().isEmpty()) {
            effectiveApiKey = "AQ.Ab8RN6IvpA6WNuiingve5PwUhwxq9wCgCDqDMrQ07P-L4aYbDg";
        }

        String effectiveModel = (model != null && !model.trim().isEmpty() && !model.startsWith("${") && !"gemini-flash-latest".equals(model)) 
                ? model.trim() 
                : "gemini-2.5-flash";

        String url = "https://generativelanguage.googleapis.com/v1beta/models/" + effectiveModel + ":generateContent?key=" + effectiveApiKey;

        Map<String, Object> requestBody = new HashMap<>();

        // System Instruction
        if (systemInstruction != null && !systemInstruction.trim().isEmpty()) {
            Map<String, Object> sysPart = new HashMap<>();
            sysPart.put("text", systemInstruction);
            Map<String, Object> sysInstr = new HashMap<>();
            sysInstr.put("parts", Collections.singletonList(sysPart));
            requestBody.put("systemInstruction", sysInstr);
        }

        // Contents
        List<Map<String, Object>> contents = new ArrayList<>();
        for (AiChatMessageDto msg : messages) {
            Map<String, Object> content = new HashMap<>();
            content.put("role", msg.getRole()); // "user" or "model"
            
            List<Map<String, Object>> parts = new ArrayList<>();
            
            if (msg.getTextContent() != null && !msg.getTextContent().isEmpty()) {
                Map<String, Object> textPart = new HashMap<>();
                textPart.put("text", msg.getTextContent());
                parts.add(textPart);
            }
            
            if (msg.getToolCalls() != null && !msg.getToolCalls().isEmpty()) {
                for (AIToolCall toolCall : msg.getToolCalls()) {
                    Map<String, Object> functionCall = new HashMap<>();
                    functionCall.put("name", toolCall.getName());
                    functionCall.put("args", toolCall.getArguments());
                    
                    Map<String, Object> part = new HashMap<>();
                    part.put("functionCall", functionCall);
                    if (toolCall.getThoughtSignature() != null && !toolCall.getThoughtSignature().trim().isEmpty()) {
                        part.put("thought_signature", toolCall.getThoughtSignature());
                        part.put("thoughtSignature", toolCall.getThoughtSignature());
                    }
                    parts.add(part);
                }
            }
            
            if (msg.getToolResponses() != null && !msg.getToolResponses().isEmpty()) {
                for (AIToolResponse toolResponse : msg.getToolResponses()) {
                    Map<String, Object> functionResponse = new HashMap<>();
                    functionResponse.put("name", toolResponse.getName());
                    try {
                        functionResponse.put("response", objectMapper.readValue(toolResponse.getContent(), Map.class));
                    } catch (JsonProcessingException e) {
                        Map<String, Object> fallback = new HashMap<>();
                        fallback.put("content", toolResponse.getContent());
                        functionResponse.put("response", fallback);
                    }
                    
                    Map<String, Object> part = new HashMap<>();
                    part.put("functionResponse", functionResponse);
                    parts.add(part);
                }
            }
            
            content.put("parts", parts);
            contents.add(content);
        }
        requestBody.put("contents", contents);

        // Tools
        if (tools != null && !tools.isEmpty()) {
            List<Map<String, Object>> functionDeclarations = new ArrayList<>();
            for (AITool tool : tools) {
                Map<String, Object> func = new HashMap<>();
                func.put("name", tool.getName());
                func.put("description", tool.getDescription());
                if (tool.getParameters() != null) {
                    func.put("parameters", tool.getParameters());
                }
                functionDeclarations.add(func);
            }
            Map<String, Object> toolObj = new HashMap<>();
            toolObj.put("functionDeclarations", functionDeclarations);
            requestBody.put("tools", Collections.singletonList(toolObj));
        }

        String rawRequest = "";
        try {
            rawRequest = objectMapper.writeValueAsString(requestBody);
        } catch (Exception e) {
            log.error("Error serializing request body", e);
        }

        SimpleClientHttpRequestFactory requestFactory = new SimpleClientHttpRequestFactory();
        requestFactory.setConnectTimeout(timeoutMs);
        requestFactory.setReadTimeout(timeoutMs);
        RestTemplate restTemplate = new RestTemplate(requestFactory);

        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        HttpEntity<String> entity = new HttpEntity<>(rawRequest, headers);

        int maxAttempts = 2;
        for (int attempt = 1; attempt <= maxAttempts; attempt++) {
            try {
                long startTime = System.currentTimeMillis();
                ResponseEntity<String> response = restTemplate.postForEntity(url, entity, String.class);
                long endTime = System.currentTimeMillis();

                if (response.getStatusCode().is2xxSuccessful() && response.getBody() != null) {
                    return parseResponse(response.getBody(), rawRequest, (endTime - startTime));
                }
            } catch (org.springframework.web.client.HttpStatusCodeException e) {
                int status = e.getStatusCode().value();
                log.warn("Gemini API HTTP {} on attempt {}/{}: {}", status, attempt, maxAttempts, e.getResponseBodyAsString());
                
                // If rate limited (429) or temporary server error (503/500), retry after pause
                if ((status == 429 || status == 503 || status == 500) && attempt < maxAttempts) {
                    try {
                        Thread.sleep(1800);
                        continue;
                    } catch (InterruptedException ie) {
                        Thread.currentThread().interrupt();
                    }
                }
                
                String userMessage = (status == 429)
                        ? "Bạn đang gửi tin nhắn hơi nhanh so với giới hạn API. Vui lòng đợi khoảng 10-15 giây rồi thử lại nhé!"
                        : "Hệ thống AI hiện đang bận hoặc quá tải, vui lòng thử lại sau.";
                        
                return AIProviderResponse.builder()
                        .text(userMessage)
                        .rawRequest(rawRequest)
                        .rawResponse(e.getMessage() + " | Body: " + e.getResponseBodyAsString())
                        .build();
            } catch (org.springframework.web.client.ResourceAccessException e) {
                log.warn("Gemini API connection/timeout on attempt {}/{}: {}", attempt, maxAttempts, e.getMessage());
                if (attempt < maxAttempts) {
                    try {
                        Thread.sleep(1500);
                        continue;
                    } catch (InterruptedException ie) {
                        Thread.currentThread().interrupt();
                    }
                }
                return AIProviderResponse.builder()
                        .text("Yêu cầu xử lý AI mất nhiều thời gian hơn dự kiến (hết thời gian chờ). Vui lòng thử lại câu hỏi ngắn gọn hơn.")
                        .rawRequest(rawRequest)
                        .rawResponse(e.getMessage())
                        .build();
            } catch (Exception e) {
                log.error("Unexpected error in GeminiProvider on attempt {}", attempt, e);
                return AIProviderResponse.builder()
                        .text("Hệ thống AI hiện đang bận hoặc quá tải, vui lòng thử lại sau.")
                        .rawRequest(rawRequest)
                        .rawResponse(e.getMessage())
                        .build();
            }
        }

        return AIProviderResponse.builder()
                .text("Hệ thống AI hiện đang bận hoặc quá tải, vui lòng thử lại sau.")
                .rawRequest(rawRequest)
                .rawResponse("Max retry attempts reached")
                .build();
    }

    private AIProviderResponse parseResponse(String rawResponse, String rawRequest, long responseTimeMs) throws Exception {
        JsonNode root = objectMapper.readTree(rawResponse);
        
        AIProviderResponse result = new AIProviderResponse();
        result.setRawRequest(rawRequest);
        result.setRawResponse(rawResponse);
        result.setResponseTimeMs(responseTimeMs);
        
        // Parse Usage
        if (root.has("usageMetadata")) {
            JsonNode usage = root.get("usageMetadata");
            result.setPromptTokens(usage.has("promptTokenCount") ? usage.get("promptTokenCount").asInt() : 0);
            result.setCompletionTokens(usage.has("candidatesTokenCount") ? usage.get("candidatesTokenCount").asInt() : 0);
            result.setTotalTokens(usage.has("totalTokenCount") ? usage.get("totalTokenCount").asInt() : 0);
        }

        if (!root.has("candidates") || root.get("candidates").isEmpty()) {
            result.setText("Hệ thống không thể xử lý câu hỏi này.");
            return result;
        }

        JsonNode candidate = root.get("candidates").get(0);
        JsonNode content = candidate.get("content");
        if (content != null && content.has("parts")) {
            String candidateThoughtSignature = null;
            for (JsonNode part : content.get("parts")) {
                if (part.has("thoughtSignature")) {
                    candidateThoughtSignature = part.get("thoughtSignature").asText();
                } else if (part.has("thought_signature")) {
                    candidateThoughtSignature = part.get("thought_signature").asText();
                }
            }

            for (JsonNode part : content.get("parts")) {
                if (part.has("text")) {
                    result.setText(part.get("text").asText());
                } else if (part.has("functionCall")) {
                    JsonNode funcCall = part.get("functionCall");
                    AIToolCall toolCall = new AIToolCall();
                    toolCall.setName(funcCall.get("name").asText());
                    toolCall.setId(UUID.randomUUID().toString());
                    if (funcCall.has("args")) {
                        toolCall.setArguments(objectMapper.convertValue(funcCall.get("args"), Map.class));
                    }
                    if (part.has("thoughtSignature")) {
                        toolCall.setThoughtSignature(part.get("thoughtSignature").asText());
                    } else if (part.has("thought_signature")) {
                        toolCall.setThoughtSignature(part.get("thought_signature").asText());
                    } else if (candidateThoughtSignature != null) {
                        toolCall.setThoughtSignature(candidateThoughtSignature);
                    }
                    if (result.getToolCalls() == null) {
                        result.setToolCalls(new ArrayList<>());
                    }
                    result.getToolCalls().add(toolCall);
                }
            }
        }
        
        return result;
    }
}
