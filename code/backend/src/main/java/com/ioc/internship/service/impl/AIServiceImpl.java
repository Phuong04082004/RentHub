package com.ioc.internship.service.impl;

import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;
import com.ioc.internship.dto.request.AiChatRequest;
import com.ioc.internship.dto.response.AiChatResponse;
import com.ioc.internship.dto.response.AiConversationResponse;
import com.ioc.internship.dto.response.AiMessageResponse;
import com.ioc.internship.entity.AiConversation;
import com.ioc.internship.entity.AiMessage;
import com.ioc.internship.entity.AiUsageLog;
import com.ioc.internship.entity.ConversationStatus;
import com.ioc.internship.entity.UserEntity;
import com.ioc.internship.repository.AiConversationRepository;
import com.ioc.internship.repository.AiMessageRepository;
import com.ioc.internship.repository.AiUsageLogRepository;
import com.ioc.internship.service.AIService;
import com.ioc.internship.service.ai.*;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
@Slf4j
public class AIServiceImpl implements AIService {

    private final AiConversationRepository conversationRepository;
    private final AiMessageRepository messageRepository;
    private final AiUsageLogRepository usageLogRepository;
    
    private final AIProvider aiProvider;
    private final AIToolExecutor toolExecutor;
    private final FAQEngine faqEngine;
    private final AiRateLimiter rateLimiter;
    private final AISecurityValidator securityValidator;

    @Value("${app.ai.enabled:true}")
    private boolean isAiEnabled;

    private static final String SYSTEM_PROMPT = "Bạn là RentHub AI Assistant, một trợ lý thông minh thân thiện giúp người dùng RentHub và sẵn sàng trò chuyện tự nhiên như Gemini. Bạn có thể nói chuyện và giải đáp bất kỳ thắc mắc nào một cách tự nhiên và cởi mở. Khi gợi ý sản phẩm liên quan đến RentHub, hãy dùng ID sản phẩm để xuất ra định dạng [PRODUCT:id].";
    private static final int WINDOW_SIZE = 20;

    @Override
    @Transactional
    public AiChatResponse chat(AiChatRequest request, UserEntity currentUser) {
        if (!isAiEnabled) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Chức năng AI hiện đang bị tắt.");
        }

        Long rateLimitUserId = (currentUser != null) ? currentUser.getId() : 0L;
        rateLimiter.checkAndConsume(rateLimitUserId);
        securityValidator.validatePromptInjection(request.getContent());

        // Process FAQ first to save tokens
        String faqAnswer = faqEngine.matchFAQ(request.getContent());
        
        AiConversation conversation = null;
        if (currentUser != null) {
            conversation = getOrCreateConversation(request.getConversationId(), request.getContent(), currentUser);
            
            // Save user message
            AiMessage userMsg = AiMessage.builder()
                    .conversation(conversation)
                    .role("user")
                    .content(request.getContent())
                    .build();
            messageRepository.save(userMsg);
        }

        if (faqAnswer != null) {
            if (conversation != null) {
                AiMessage assistantMsg = AiMessage.builder()
                        .conversation(conversation)
                        .role("model")
                        .content(faqAnswer)
                        .build();
                messageRepository.save(assistantMsg);
                return new AiChatResponse(faqAnswer, conversation.getId(), conversation.getTitle());
            } else {
                return new AiChatResponse(faqAnswer, null, "Tư vấn RentHub");
            }
        }

        // Token optimization (Windowing)
        List<AiChatMessageDto> dtoHistory;
        if (conversation != null) {
            List<AiMessage> history = messageRepository.findAllByConversationOrderByCreatedAtAsc(conversation);
            if (history.size() > WINDOW_SIZE) {
                history = history.subList(history.size() - WINDOW_SIZE, history.size());
            }

            dtoHistory = history.stream()
                    .map(m -> AiChatMessageDto.builder()
                            .role(m.getRole())
                            .textContent(m.getContent())
                            .build())
                    .collect(Collectors.toList());
        } else {
            dtoHistory = new ArrayList<>();
            dtoHistory.add(AiChatMessageDto.builder()
                    .role("user")
                    .textContent(request.getContent())
                    .build());
        }

        // Generate Response
        AIProviderResponse aiResponse;
        try {
            List<AITool> availableTools = toolExecutor.getAvailableTools();
            aiResponse = aiProvider.generateResponse(dtoHistory, SYSTEM_PROMPT, availableTools);

            // Handle Tool Calls if any
            if (aiResponse.getToolCalls() != null && !aiResponse.getToolCalls().isEmpty()) {
                AiChatMessageDto toolCallMsg = AiChatMessageDto.builder()
                        .role("model")
                        .textContent(aiResponse.getText())
                        .toolCalls(aiResponse.getToolCalls())
                        .build();
                dtoHistory.add(toolCallMsg);

                List<AIToolResponse> toolResponses = new ArrayList<>();
                for (AIToolCall toolCall : aiResponse.getToolCalls()) {
                    String result = toolExecutor.executeTool(toolCall, currentUser);
                    toolResponses.add(AIToolResponse.builder()
                            .name(toolCall.getName())
                            .toolCallId(toolCall.getId())
                            .content(result)
                            .build());
                }

                AiChatMessageDto toolResultMsg = AiChatMessageDto.builder()
                        .role("user")
                        .toolResponses(toolResponses)
                        .build();
                dtoHistory.add(toolResultMsg);

                // Second call with tool results
                aiResponse = aiProvider.generateResponse(dtoHistory, SYSTEM_PROMPT, availableTools);
            }
        } catch (Exception e) {
            log.error("AI processing error", e);
            String errorMessage = "Xin lỗi, hiện tại hệ thống AI đang gặp sự cố hoặc chưa được cấu hình API Key. Vui lòng liên hệ quản trị viên.";
            if (conversation != null) {
                AiMessage errorMsg = AiMessage.builder()
                        .conversation(conversation)
                        .role("model")
                        .content(errorMessage)
                        .build();
                messageRepository.save(errorMsg);
                return new AiChatResponse(errorMessage, conversation.getId(), conversation.getTitle());
            } else {
                return new AiChatResponse(errorMessage, null, "Lỗi kết nối AI");
            }
        }

        // Save AI Message if logged in
        if (conversation != null) {
            AiMessage assistantMsg = AiMessage.builder()
                    .conversation(conversation)
                    .role("model")
                    .content(aiResponse.getText())
                    .build();
            messageRepository.save(assistantMsg);

            // Usage Logging
            saveUsageLog(currentUser, conversation, aiResponse);

            return new AiChatResponse(aiResponse.getText(), conversation.getId(), conversation.getTitle());
        } else {
            return new AiChatResponse(aiResponse.getText(), null, "Tư vấn RentHub");
        }
    }

    private AiConversation getOrCreateConversation(Long conversationId, String firstMessageContent, UserEntity currentUser) {
        if (conversationId != null) {
            AiConversation conversation = conversationRepository.findByIdAndUserAndIsDeletedFalse(conversationId, currentUser)
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Không tìm thấy cuộc hội thoại"));
            securityValidator.validateOwnership(conversation, currentUser);
            return conversation;
        }

        // Auto-generate title from first message
        String title = firstMessageContent.length() > 30 
                ? firstMessageContent.substring(0, 30) + "..." 
                : firstMessageContent;

        AiConversation conversation = AiConversation.builder()
                .user(currentUser)
                .title(title)
                .build();
        return conversationRepository.save(conversation);
    }

    private void saveUsageLog(UserEntity user, AiConversation conversation, AIProviderResponse res) {
        if (res.getPromptTokens() != null) {
            // Rough estimation $0.075 / 1M prompt tokens, $0.3 / 1M completion tokens for Flash
            BigDecimal cost = BigDecimal.valueOf((res.getPromptTokens() * 0.075 + res.getCompletionTokens() * 0.3) / 1_000_000.0);
            
            AiUsageLog logEntry = AiUsageLog.builder()
                    .user(user)
                    .conversation(conversation)
                    .model(aiProvider.getModelName())
                    .promptTokens(res.getPromptTokens())
                    .completionTokens(res.getCompletionTokens())
                    .totalTokens(res.getTotalTokens())
                    .estimatedCost(cost)
                    .rawRequest(res.getRawRequest())
                    .rawResponse(res.getRawResponse())
                    .responseTimeMs(res.getResponseTimeMs() != null ? res.getResponseTimeMs() : 0L)
                    .build();
            usageLogRepository.save(logEntry);
        }
    }

    @Override
    public List<AiConversationResponse> getConversations(UserEntity currentUser) {
        return conversationRepository.findAllByUserAndIsDeletedFalseOrderByUpdatedAtDesc(currentUser)
                .stream()
                .map(this::mapToDto)
                .collect(Collectors.toList());
    }

    @Override
    public AiConversationResponse getConversation(Long id, UserEntity currentUser) {
        AiConversation conversation = conversationRepository.findByIdAndUserAndIsDeletedFalse(id, currentUser)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Hội thoại không tồn tại."));
        return mapToDto(conversation);
    }

    @Override
    public List<AiMessageResponse> getMessages(Long conversationId, UserEntity currentUser) {
        AiConversation conversation = conversationRepository.findByIdAndUserAndIsDeletedFalse(conversationId, currentUser)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Hội thoại không tồn tại."));
        return messageRepository.findAllByConversationOrderByCreatedAtAsc(conversation)
                .stream()
                .map(m -> new AiMessageResponse(m.getId(), m.getRole(), m.getContent(), m.getCreatedAt()))
                .collect(Collectors.toList());
    }

    @Override
    @Transactional
    public void archiveConversation(Long id, UserEntity currentUser) {
        AiConversation conversation = conversationRepository.findByIdAndUserAndIsDeletedFalse(id, currentUser)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Hội thoại không tồn tại."));
        conversation.setStatus(ConversationStatus.ARCHIVED);
        conversationRepository.save(conversation);
    }

    @Override
    @Transactional
    public void restoreConversation(Long id, UserEntity currentUser) {
        AiConversation conversation = conversationRepository.findByIdAndUserAndIsDeletedFalse(id, currentUser)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Hội thoại không tồn tại."));
        conversation.setStatus(ConversationStatus.ACTIVE);
        conversationRepository.save(conversation);
    }

    @Override
    @Transactional
    public void deleteConversation(Long id, UserEntity currentUser) {
        AiConversation conversation = conversationRepository.findByIdAndUserAndIsDeletedFalse(id, currentUser)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Hội thoại không tồn tại."));
        conversation.setDeleted(true);
        conversationRepository.save(conversation);
    }

    private AiConversationResponse mapToDto(AiConversation c) {
        return AiConversationResponse.builder()
                .id(c.getId())
                .title(c.getTitle())
                .status(c.getStatus())
                .createdAt(c.getCreatedAt())
                .updatedAt(c.getUpdatedAt())
                .build();
    }
}
