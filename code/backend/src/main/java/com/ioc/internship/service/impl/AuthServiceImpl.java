package com.ioc.internship.service.impl;

import com.ioc.internship.common.utils.JwtUtils;
import com.ioc.internship.dto.response.AuthResponse;
import com.ioc.internship.dto.request.LoginRequest;
import com.ioc.internship.dto.request.RegisterRequest;
import com.ioc.internship.dto.request.VerifyOtpRequest;
import com.ioc.internship.dto.request.ResendOtpRequest;
import com.ioc.internship.dto.request.ForgotPasswordRequest;
import com.ioc.internship.dto.request.ResetPasswordRequest;
import com.ioc.internship.dto.response.RegistrationStatusResponse;
import com.ioc.internship.entity.UserEntity;
import com.ioc.internship.entity.EmailOtp;
import com.ioc.internship.entity.OtpPurpose;
import com.ioc.internship.entity.OtpStatus;
import com.ioc.internship.repository.UserRepository;
import com.ioc.internship.repository.EmailOtpRepository;
import com.ioc.internship.service.AuthService;
import com.ioc.internship.service.EmailService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

import javax.sql.DataSource;
import java.sql.Connection;
import java.sql.DatabaseMetaData;
import java.security.SecureRandom;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

@Slf4j
@Service
@RequiredArgsConstructor
public class AuthServiceImpl implements AuthService {

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtUtils jwtUtils;
    private final AuthenticationManager authenticationManager;
    private final DataSource dataSource;

    private final EmailOtpRepository emailOtpRepository;
    private final EmailService emailService;
    private final SecureRandom secureRandom = new SecureRandom();

    private String generateOtp() {
        return String.valueOf(100000 + secureRandom.nextInt(900000));
    }

    private void createAndSendOtp(String email, OtpPurpose purpose) {
        // Rate limit checks (Resend OTP Protection)
        LocalDateTime now = LocalDateTime.now();
        int reqLastMinute = emailOtpRepository.countByEmailAndCreatedAtAfter(email, now.minusMinutes(1));
        if (reqLastMinute >= 1) throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS, "Vui lòng đợi 60 giây trước khi yêu cầu mã mới.");
        
        int reqLastHour = emailOtpRepository.countByEmailAndCreatedAtAfter(email, now.minusHours(1));
        if (reqLastHour >= 5) throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS, "Bạn đã vượt quá giới hạn 5 lần gửi mã trong 1 giờ.");

        int reqLastDay = emailOtpRepository.countByEmailAndCreatedAtAfter(email, now.minusDays(1));
        if (reqLastDay >= 20) throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS, "Bạn đã vượt quá giới hạn 20 lần gửi mã trong 1 ngày.");

        // Invalidate old ACTIVE OTPs
        emailOtpRepository.findFirstByEmailAndPurposeAndStatusOrderByCreatedAtDesc(email, purpose, OtpStatus.ACTIVE)
            .ifPresent(oldOtp -> {
                oldOtp.setStatus(OtpStatus.INVALIDATED);
                emailOtpRepository.save(oldOtp);
            });

        String rawOtp = generateOtp();
        EmailOtp otpEntity = EmailOtp.builder()
                .email(email)
                .otpCode(passwordEncoder.encode(rawOtp))
                .purpose(purpose)
                .status(OtpStatus.ACTIVE)
                .expiredAt(now.plusMinutes(5))
                .build();
        emailOtpRepository.save(otpEntity);

        emailService.sendOtpEmail(email, rawOtp);
        log.info("Audit: {}_OTP_SENT to {}", purpose, email);
    }

    @Override
    @Transactional
    public void register(RegisterRequest request) {
        log.info("Audit: REGISTER_REQUESTED for {}", request.getEmail());
        var existingUserOpt = userRepository.findByEmail(request.getEmail());

        if (existingUserOpt.isPresent()) {
            UserEntity existingUser = existingUserOpt.get();
            if ("ACTIVE".equals(existingUser.getStatus())) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Email này đã được sử dụng trên hệ thống!");
            } else if ("PENDING".equals(existingUser.getStatus())) {
                existingUser.setFullName(request.getFullName());
                existingUser.setPassword(passwordEncoder.encode(request.getPassword()));
                userRepository.save(existingUser);
            }
        } else {
            UserEntity user = new UserEntity();
            user.setEmail(request.getEmail());
            user.setFullName(request.getFullName());
            user.setPassword(passwordEncoder.encode(request.getPassword()));
            user.setRole("ROLE_USER");
            user.setStatus("PENDING");
            userRepository.save(user);
        }

        createAndSendOtp(request.getEmail(), OtpPurpose.REGISTER);
    }

    @Override
    public AuthResponse login(LoginRequest request) {
        String rawEmail = request.getEmail();
        String trimmedEmail = rawEmail != null ? rawEmail.trim() : "";

        log.info("==================== [LOGIN DEBUG START] ====================");
        log.info("--> [LOGIN REQUEST] Raw email: '{}', Trimmed: '{}'", rawEmail, trimmedEmail);

        // 1. Log Database Connection Info
        try (Connection conn = dataSource.getConnection()) {
            DatabaseMetaData meta = conn.getMetaData();
            log.info("--> [DB INFO] URL: {}", meta.getURL());
            log.info("--> [DB INFO] Product: {} (version {})", meta.getDatabaseProductName(), meta.getDatabaseProductVersion());
            log.info("--> [DB INFO] User: {}", meta.getUserName());
            log.info("--> [DB INFO] Catalog/Database: {}", conn.getCatalog());
        } catch (Exception e) {
            log.error("--> [DB INFO ERROR] Could not get DB metadata: {}", e.getMessage());
        }

        // 2. Log Total Users & Sample Emails in DB
        long totalUsers = userRepository.count();
        log.info("--> [DB USERS COUNT] Total users in DB: {}", totalUsers);
        if (totalUsers == 0) {
            log.warn("--> [DB WARNING] The 'users' table is COMPLETELY EMPTY! Data has not been imported into this database.");
        } else {
            List<String> sampleEmails = userRepository.findAll().stream()
                    .map(u -> String.format("[email='%s', status='%s', role='%s']", u.getEmail(), u.getStatus(), u.getRole()))
                    .limit(10)
                    .toList();
            log.info("--> [DB USERS SAMPLE (up to 10)] {}", sampleEmails);
        }

        // 3. User lookup (exact, trimmed, ignore case)
        Optional<UserEntity> userOpt = userRepository.findByEmail(rawEmail);
        if (userOpt.isEmpty() && !rawEmail.equals(trimmedEmail)) {
            userOpt = userRepository.findByEmail(trimmedEmail);
        }
        if (userOpt.isEmpty()) {
            userOpt = userRepository.findByEmailIgnoreCase(trimmedEmail);
            if (userOpt.isPresent()) {
                log.info("--> [LOGIN MATCH] Found user via case-insensitive search: '{}'", userOpt.get().getEmail());
            }
        }

        if (userOpt.isEmpty()) {
            log.warn("--> [LOGIN 404 NOT FOUND] No user found with email: '{}'. Total users in DB: {}", rawEmail, totalUsers);
            log.info("==================== [LOGIN DEBUG END - 404] ====================");
            throw new ResponseStatusException(HttpStatus.NOT_FOUND,
                    "Không tìm thấy người dùng! (Email: '" + rawEmail + "' không tồn tại trong DB hiện tại. Tổng số user trong DB: " + totalUsers + ")");
        }

        UserEntity user = userOpt.get();
        log.info("--> [USER FOUND] ID: {}, Email: '{}', Status: '{}', Role: '{}', isEnabled: {}",
                user.getId(), user.getEmail(), user.getStatus(), user.getRole(), user.isEnabled());

        if (!user.isEnabled()) {
            log.warn("--> [LOGIN 401 UNAUTHORIZED] User '{}' is not ACTIVE (current status: '{}')", user.getEmail(), user.getStatus());
            log.info("==================== [LOGIN DEBUG END - 401] ====================");
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Tài khoản của bạn chưa được kích hoạt. Vui lòng xác thực email.");
        }

        log.info("--> [AUTH MANAGER] Authenticating password for user '{}'...", user.getEmail());
        authenticationManager.authenticate(
                new UsernamePasswordAuthenticationToken(user.getEmail(), request.getPassword())
        );

        String jwtToken = jwtUtils.generateToken(user);
        log.info("--> [LOGIN SUCCESS] Successfully authenticated and generated JWT for '{}'", user.getEmail());
        log.info("==================== [LOGIN DEBUG END - SUCCESS] ====================");

        return AuthResponse.builder()
                .token(jwtToken)
                .email(user.getEmail())
                .fullName(user.getFullName())
                .build();
    }

    @Override
    @Transactional
    public AuthResponse verifyRegisterOtp(VerifyOtpRequest request) {
        UserEntity user = userRepository.findByEmail(request.getEmail())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Không tìm thấy người dùng!"));

        if (user.isEnabled()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Tài khoản đã được kích hoạt trước đó.");
        }

        EmailOtp otp = emailOtpRepository.findFirstByEmailAndPurposeAndStatusOrderByCreatedAtDesc(request.getEmail(), OtpPurpose.REGISTER, OtpStatus.ACTIVE)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Không có mã xác thực nào đang hoạt động."));

        if (LocalDateTime.now().isAfter(otp.getExpiredAt())) {
            otp.setStatus(OtpStatus.EXPIRED);
            emailOtpRepository.save(otp);
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Mã OTP đã hết hạn.");
        }

        if (!passwordEncoder.matches(request.getOtp(), otp.getOtpCode())) {
            otp.setAttemptCount(otp.getAttemptCount() + 1);
            if (otp.getAttemptCount() >= 5) {
                otp.setStatus(OtpStatus.LOCKED);
                emailOtpRepository.save(otp);
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Mã OTP đã bị khóa do nhập sai quá nhiều lần. Vui lòng gửi lại mã mới.");
            }
            emailOtpRepository.save(otp);
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Mã OTP không chính xác.");
        }

        otp.setStatus(OtpStatus.VERIFIED);
        emailOtpRepository.save(otp);

        user.setStatus("ACTIVE");
        userRepository.save(user);

        log.info("Audit: REGISTER_VERIFIED for {}", request.getEmail());
        log.info("Audit: AUTO_LOGIN_AFTER_REGISTER for {}", request.getEmail());

        String jwtToken = jwtUtils.generateToken(user);
        return AuthResponse.builder()
                .token(jwtToken)
                .email(user.getEmail())
                .fullName(user.getFullName())
                .build();
    }

    @Override
    @Transactional
    public void resendRegisterOtp(ResendOtpRequest request) {
        UserEntity user = userRepository.findByEmail(request.getEmail())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Không tìm thấy người dùng!"));

        if (user.isEnabled()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Tài khoản đã được kích hoạt.");
        }

        log.info("Audit: REGISTER_OTP_RESENT for {}", request.getEmail());
        createAndSendOtp(request.getEmail(), OtpPurpose.REGISTER);
    }

    @Override
    public RegistrationStatusResponse getRegistrationStatus(String email) {
        var userOpt = userRepository.findByEmail(email);
        if (userOpt.isEmpty()) {
            return RegistrationStatusResponse.builder().registered(false).verified(false).canResendIn(0).build();
        }

        boolean verified = userOpt.get().isEnabled();
        int canResendIn = 0;

        var lastOtp = emailOtpRepository.findFirstByEmailAndPurposeAndStatusOrderByCreatedAtDesc(email, OtpPurpose.REGISTER, OtpStatus.ACTIVE);
        if (lastOtp.isPresent()) {
            LocalDateTime nextResend = lastOtp.get().getCreatedAt().plusMinutes(1);
            if (LocalDateTime.now().isBefore(nextResend)) {
                canResendIn = (int) java.time.Duration.between(LocalDateTime.now(), nextResend).getSeconds();
            }
        }

        return RegistrationStatusResponse.builder()
                .registered(true)
                .verified(verified)
                .canResendIn(Math.max(canResendIn, 0))
                .build();
    }

    @Override
    @Transactional
    public void forgotPassword(ForgotPasswordRequest request) {
        userRepository.findByEmail(request.getEmail())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Không tìm thấy tài khoản với email này!"));

        log.info("Audit: FORGOT_PASSWORD_REQUESTED for {}", request.getEmail());
        createAndSendOtp(request.getEmail(), OtpPurpose.FORGOT_PASSWORD);
    }

    @Override
    @Transactional
    public void resetPassword(ResetPasswordRequest request) {
        UserEntity user = userRepository.findByEmail(request.getEmail())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Không tìm thấy người dùng!"));

        EmailOtp otp = emailOtpRepository.findFirstByEmailAndPurposeAndStatusOrderByCreatedAtDesc(request.getEmail(), OtpPurpose.FORGOT_PASSWORD, OtpStatus.ACTIVE)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Không có mã xác thực nào đang hoạt động."));

        if (LocalDateTime.now().isAfter(otp.getExpiredAt())) {
            otp.setStatus(OtpStatus.EXPIRED);
            emailOtpRepository.save(otp);
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Mã OTP đã hết hạn.");
        }

        if (!passwordEncoder.matches(request.getOtp(), otp.getOtpCode())) {
            otp.setAttemptCount(otp.getAttemptCount() + 1);
            if (otp.getAttemptCount() >= 5) {
                otp.setStatus(OtpStatus.LOCKED);
                emailOtpRepository.save(otp);
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Mã OTP đã bị khóa do nhập sai quá nhiều lần.");
            }
            emailOtpRepository.save(otp);
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Mã OTP không chính xác.");
        }

        otp.setStatus(OtpStatus.VERIFIED);
        emailOtpRepository.save(otp);

        user.setPassword(passwordEncoder.encode(request.getNewPassword()));
        userRepository.save(user);

        log.info("Audit: PASSWORD_RESET_SUCCESS for {}", request.getEmail());
    }
}