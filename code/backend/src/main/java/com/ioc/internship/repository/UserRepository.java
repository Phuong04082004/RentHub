package com.ioc.internship.repository;

import com.ioc.internship.entity.UserEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public interface UserRepository extends JpaRepository<UserEntity, Long>, JpaSpecificationExecutor<UserEntity> {

    // 1. Tìm kiếm người dùng bằng email phục vụ luồng Đăng nhập (Login)
    // Trả về Optional để tránh lỗi NullPointerException nếu không tìm thấy
    Optional<UserEntity> findByEmail(String email);

    Optional<UserEntity> findByEmailIgnoreCase(String email);

    // 2. Kiểm tra xem email đã tồn tại trong hệ thống chưa (dùng cho luồng Đăng ký)
    boolean existsByEmail(String email);

    // 3. Kiểm tra xem số điện thoại đã tồn tại chưa (dùng cho luồng Đăng ký)
    boolean existsByPhone(String phone);

    // 4. Kiểm tra số điện thoại tồn tại trừ ID của user đang update
    boolean existsByPhoneAndIdNot(String phone, Long id);

    long countByRole(String role);
}