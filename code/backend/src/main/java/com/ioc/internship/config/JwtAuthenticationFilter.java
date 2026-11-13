package com.ioc.internship.config;

import com.ioc.internship.common.utils.JwtUtils;
import io.jsonwebtoken.ExpiredJwtException;
import io.jsonwebtoken.JwtException;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.http.MediaType;
import org.springframework.lang.NonNull;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.web.authentication.WebAuthenticationDetailsSource;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;

@Component
@RequiredArgsConstructor
public class JwtAuthenticationFilter extends OncePerRequestFilter {

    private final JwtUtils jwtUtils;
    private final UserDetailsService userDetailsService;

    @Override
    protected void doFilterInternal(
            @NonNull HttpServletRequest request,
            @NonNull HttpServletResponse response,
            @NonNull FilterChain filterChain
    ) throws ServletException, IOException {

        // Dung getRequestURI() de quet toan bo URL
        String requestUri = request.getRequestURI();
        if (requestUri.contains("/api/v1/auth") ||
                requestUri.contains("/swagger-ui") ||
                requestUri.contains("/v3/api-docs")) {
            filterChain.doFilter(request, response);
            return;
        }

        // 1. Lay chuoi ma hoa nam trong truong "Authorization" tu Header
        final String authHeader = request.getHeader("Authorization");
        final String jwt;
        final String userEmail;

        // Neu Header trong hoac khong bat dau bang "Bearer ", cho Request di tiep
        if (authHeader == null || !authHeader.startsWith("Bearer ")) {
            filterChain.doFilter(request, response);
            return;
        }

        try {
            // 2. Cat bo "Bearer " de lay chinh xac chuoi JWT Token
            jwt = authHeader.substring(7);

            // 3. Su dung JwtUtils de boc tach lay Email
            userEmail = jwtUtils.extractEmail(jwt);

            // 4. Neu boc duoc Email VA nguoi dung nay CHUA duoc xac thuc trong phien nay
            if (userEmail != null && SecurityContextHolder.getContext().getAuthentication() == null) {

                // Xuong DB tim thong tin day du cua User
                UserDetails userDetails = this.userDetailsService.loadUserByUsername(userEmail);

                // Kiem tra xem Token co chinh chu va con han su dung hay khong
                if (jwtUtils.isTokenValid(jwt, userDetails)) {

                    // Tao mot chiec "The thong hanh"
                    UsernamePasswordAuthenticationToken authToken = new UsernamePasswordAuthenticationToken(
                            userDetails,
                            null,
                            userDetails.getAuthorities()
                    );

                    // Dong dau chi tiet Request
                    authToken.setDetails(new WebAuthenticationDetailsSource().buildDetails(request));

                    // CAT CHIEC THE NAY VAO KET SAT BAO MAT
                    SecurityContextHolder.getContext().setAuthentication(authToken);
                }
            }
        } catch (ExpiredJwtException e) {
            // Token het han -> tra ve 401 Unauthorized ro rang
            logger.warn("JWT token het han: " + e.getMessage());
            response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
            response.setContentType(MediaType.APPLICATION_JSON_VALUE);
            response.getWriter().write("{\"error\": \"Token het han, vui long dang nhap lai\"}");
            return;
        } catch (JwtException e) {
            // Token bi gia mao hoac khong hop le -> tra ve 401
            logger.warn("JWT token khong hop le: " + e.getMessage());
            response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
            response.setContentType(MediaType.APPLICATION_JSON_VALUE);
            response.getWriter().write("{\"error\": \"Token khong hop le\"}");
            return;
        } catch (Exception e) {
            logger.warn("JWT authentication that bai: " + e.getMessage());
        }

        // Mo cua cho Request tiep tuc hanh trinh
        filterChain.doFilter(request, response);
    }
}
