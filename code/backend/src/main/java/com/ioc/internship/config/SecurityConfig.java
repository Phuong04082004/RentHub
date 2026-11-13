package com.ioc.internship.config;

import lombok.RequiredArgsConstructor;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import java.util.List;

@Configuration
@EnableWebSecurity // Kích hoạt tính năng bảo mật Web Security của Spring
@EnableMethodSecurity
@RequiredArgsConstructor
public class SecurityConfig {

    private final JwtAuthenticationFilter jwtAuthFilter;

    @Bean
    public SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
        http
                // BƯỚC 1: KÍCH HOẠT VÀ NẠP CẤU HÌNH CORS VÀO LUỒNG BẢO MẬT
                .cors(cors -> cors.configurationSource(corsConfigurationSource()))

                // 2. Tắt CSRF bảo vệ vì dùng cơ chế Stateless với JWT Token
                .csrf(AbstractHttpConfigurer::disable)

                // 3. Cấu hình phân quyền cho các đường dẫn API (ĐÃ SỬA: XÓA someMethod())
                .authorizeHttpRequests(auth -> auth
                        // Cho phép các API liên quan đến Đăng ký, Đăng nhập và Xác thực Email được truy cập TỰ DO
                        .requestMatchers(
                                "/api/v1/auth/**",
                                "/api/payments/sepay-webhook",
                                "/swagger-ui/**",
                                "/swagger-ui.html",
                                "/api/test-debug/**",
                                "/v3/api-docs/**").permitAll()
                        .requestMatchers(org.springframework.http.HttpMethod.GET, "/api/categories", "/api/categories/**").permitAll()
                        .requestMatchers(org.springframework.http.HttpMethod.GET, "/api/products/public", "/api/products/public/**").permitAll()
                        .requestMatchers(org.springframework.http.HttpMethod.GET, "/api/products/*/blocked-dates").permitAll()
                        .requestMatchers(org.springframework.http.HttpMethod.GET, "/api/products/*/reviews", "/api/reviews/**").permitAll()
                        .requestMatchers(org.springframework.http.HttpMethod.GET, "/api/users/*/public", "/api/users/*/public/**").permitAll()
                        .requestMatchers("/ws/**").permitAll()
                        .requestMatchers(org.springframework.http.HttpMethod.POST, "/api/ai/chat").permitAll()
                        .requestMatchers("/api/admin/users", "/api/admin/users/**", "/api/admin/products", "/api/admin/products/**", "/api/admin/ai", "/api/admin/ai/**").hasAuthority("ROLE_ADMIN")
                        .requestMatchers("/api/users/profile", "/api/users/profile/**").hasAnyAuthority("ROLE_USER", "ROLE_ADMIN")
                        .requestMatchers("/api/favorites", "/api/favorites/**").hasAnyAuthority("ROLE_USER", "ROLE_ADMIN")
                        .requestMatchers("/api/chat", "/api/chat/**").hasAnyAuthority("ROLE_USER", "ROLE_ADMIN")
                        .requestMatchers("/api/ai", "/api/ai/**").hasAnyAuthority("ROLE_USER", "ROLE_ADMIN")
                        // Tất cả các API còn lại trong hệ thống bắt buộc phải ĐĂNG NHẬP
                        .anyRequest().authenticated()
                )

                // 4. Cấu hình quản lý Session: Đổi sang Stateless
                .sessionManagement(session -> session
                        .sessionCreationPolicy(SessionCreationPolicy.STATELESS)
                )

                // 5. CHÈN ANH GÁC CỔNG FILTER VÀO
                .addFilterBefore(jwtAuthFilter, UsernamePasswordAuthenticationFilter.class);

        return http.build();
    }

    // BƯỚC 2: ĐỊNH NGHĨA CHI TIẾT BỘ CẤU HÌNH CORS CHO NEXT.JS
    @Bean
    public CorsConfigurationSource corsConfigurationSource() {
        CorsConfiguration configuration = new CorsConfiguration();

        // Cho phép cổng 3000 của Next.js frontend gõ cửa kết nối sang
        configuration.setAllowedOrigins(List.of("http://localhost:3000"));

        // Cho phép đầy đủ các phương thức gửi request cơ bản
        configuration.setAllowedMethods(List.of("GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"));

        // Cho phép truyền các Header quan trọng như Content-Type và Token Authorization
        configuration.setAllowedHeaders(List.of("*"));

        // Cho phép gửi kèm thông tin định danh (Credentials) nếu có
        configuration.setAllowCredentials(true);

        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", configuration); // Áp dụng cho toàn bộ các API trong hệ thống
        return source;
    }
}