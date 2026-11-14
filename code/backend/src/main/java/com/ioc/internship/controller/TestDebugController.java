package com.ioc.internship.controller;

import com.ioc.internship.dto.request.ReviewRequest;
import com.ioc.internship.dto.response.ReviewResponse;
import com.ioc.internship.entity.UserEntity;
import com.ioc.internship.repository.UserRepository;
import com.ioc.internship.service.ReviewService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import javax.sql.DataSource;
import java.sql.Connection;
import java.sql.DatabaseMetaData;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

@Slf4j
@RestController
@RequestMapping("/api/test-debug")
@RequiredArgsConstructor
public class TestDebugController {

    private final ReviewService reviewService;
    private final UserRepository userRepository;
    private final DataSource dataSource;

    @GetMapping("/check-user")
    public ResponseEntity<Map<String, Object>> checkUser(
            @RequestParam(defaultValue = "phamminhphuong04082004@gmail.com") String email) {

        Map<String, Object> result = new HashMap<>();
        String trimmedEmail = email != null ? email.trim() : "";

        // 1. DB Info
        Map<String, Object> dbInfo = new HashMap<>();
        try (Connection conn = dataSource.getConnection()) {
            DatabaseMetaData meta = conn.getMetaData();
            dbInfo.put("url", meta.getURL());
            dbInfo.put("product", meta.getDatabaseProductName() + " " + meta.getDatabaseProductVersion());
            dbInfo.put("user", meta.getUserName());
            dbInfo.put("catalog", conn.getCatalog());
        } catch (Exception e) {
            dbInfo.put("error", e.getMessage());
        }
        result.put("dbInfo", dbInfo);

        // 2. Total count
        long totalUsers = userRepository.count();
        result.put("totalUsersInDb", totalUsers);

        // 3. Sample users
        List<Map<String, Object>> sampleUsers = userRepository.findAll().stream()
                .limit(10)
                .map(u -> {
                    Map<String, Object> map = new HashMap<>();
                    map.put("id", u.getId());
                    map.put("email", u.getEmail());
                    map.put("status", u.getStatus());
                    map.put("role", u.getRole());
                    map.put("isEnabled", u.isEnabled());
                    return map;
                })
                .toList();
        result.put("sampleUsers", sampleUsers);

        // 4. Target user search
        Optional<UserEntity> userOpt = userRepository.findByEmail(trimmedEmail);
        if (userOpt.isEmpty()) {
            userOpt = userRepository.findByEmailIgnoreCase(trimmedEmail);
        }

        if (userOpt.isPresent()) {
            UserEntity u = userOpt.get();
            Map<String, Object> userInfo = new HashMap<>();
            userInfo.put("id", u.getId());
            userInfo.put("email", u.getEmail());
            userInfo.put("fullName", u.getFullName());
            userInfo.put("status", u.getStatus());
            userInfo.put("role", u.getRole());
            userInfo.put("isEnabled", u.isEnabled());
            result.put("targetUserFound", true);
            result.put("targetUserInfo", userInfo);
        } else {
            result.put("targetUserFound", false);
            result.put("targetUserMessage", "User '" + email + "' not found in DB! (Total users: " + totalUsers + ")");
        }

        log.info("[CHECK-USER DEBUG] Result: {}", result);
        return ResponseEntity.ok(result);
    }

    @PostMapping("/reviews/{email}")
    public ResponseEntity<?> testCreateReview(@PathVariable String email, @RequestBody ReviewRequest request) {
        try {
            return ResponseEntity.ok(reviewService.createReview(email, request));
        } catch (Exception e) {
            java.io.StringWriter sw = new java.io.StringWriter();
            e.printStackTrace(new java.io.PrintWriter(sw));
            return ResponseEntity.status(500).body(sw.toString());
        }
    }
}
