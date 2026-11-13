package com.ioc.internship.controller;

import org.springframework.security.core.Authentication;
import com.ioc.internship.dto.request.AiChatRequest;
import com.ioc.internship.dto.response.AiChatResponse;
import com.ioc.internship.dto.response.AiConversationResponse;
import com.ioc.internship.dto.response.AiMessageResponse;
import com.ioc.internship.entity.UserEntity;
import com.ioc.internship.service.AIService;
import com.ioc.internship.service.UserService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/ai")
@RequiredArgsConstructor
public class AiController {

    private final AIService aiService;
    private final UserService userService;

    @PostMapping("/chat")
    public ResponseEntity<AiChatResponse> chat(@Valid @RequestBody AiChatRequest request, Authentication authentication) {
        UserEntity user = null;
        if (authentication != null && authentication.isAuthenticated() && !"anonymousUser".equals(authentication.getName())) {
            try {
                user = userService.getUserByEmail(authentication.getName());
            } catch (Exception ignored) {
                // Người dùng chưa đăng nhập hoặc không tìm thấy user
            }
        }
        return ResponseEntity.ok(aiService.chat(request, user));
    }

    @GetMapping("/conversations")
    public ResponseEntity<List<AiConversationResponse>> getConversations(Authentication authentication) {
        UserEntity user = userService.getUserByEmail(authentication.getName());
        return ResponseEntity.ok(aiService.getConversations(user));
    }

    @GetMapping("/conversations/{id}")
    public ResponseEntity<AiConversationResponse> getConversation(@PathVariable Long id, Authentication authentication) {
        UserEntity user = userService.getUserByEmail(authentication.getName());
        return ResponseEntity.ok(aiService.getConversation(id, user));
    }

    @GetMapping("/conversations/{id}/messages")
    public ResponseEntity<List<AiMessageResponse>> getMessages(@PathVariable Long id, Authentication authentication) {
        UserEntity user = userService.getUserByEmail(authentication.getName());
        return ResponseEntity.ok(aiService.getMessages(id, user));
    }

    @PostMapping("/conversations/{id}/archive")
    public ResponseEntity<Void> archiveConversation(@PathVariable Long id, Authentication authentication) {
        UserEntity user = userService.getUserByEmail(authentication.getName());
        aiService.archiveConversation(id, user);
        return ResponseEntity.ok().build();
    }

    @PostMapping("/conversations/{id}/restore")
    public ResponseEntity<Void> restoreConversation(@PathVariable Long id, Authentication authentication) {
        UserEntity user = userService.getUserByEmail(authentication.getName());
        aiService.restoreConversation(id, user);
        return ResponseEntity.ok().build();
    }

    @DeleteMapping("/conversations/{id}")
    public ResponseEntity<Void> deleteConversation(@PathVariable Long id, Authentication authentication) {
        UserEntity user = userService.getUserByEmail(authentication.getName());
        aiService.deleteConversation(id, user);
        return ResponseEntity.ok().build();
    }
}
