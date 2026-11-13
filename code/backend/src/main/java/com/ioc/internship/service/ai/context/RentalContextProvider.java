package com.ioc.internship.service.ai.context;

import com.ioc.internship.dto.response.RentalRequestSummaryResponse;
import com.ioc.internship.entity.UserEntity;
import com.ioc.internship.service.RentalRequestService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class RentalContextProvider {

    private final RentalRequestService rentalRequestService;

    public String getMyRentalsContext(UserEntity user) {
        if (user == null) {
            return "Người dùng hiện chưa đăng nhập. Vui lòng đăng nhập để xem thông tin đơn thuê.";
        }
        // Just fetching the latest 3 rentals for context
        List<RentalRequestSummaryResponse> rentals = rentalRequestService.getMyRentalRequests(user.getEmail(), null, 0, 3).getContent();
        if (rentals == null || rentals.isEmpty()) {
            return "Bạn hiện không có đơn thuê nào.";
        }
        
        return rentals.stream()
                .map(r -> String.format("Mã đơn: %d, Sản phẩm: %s, Trạng thái: %s", r.getId(), r.getProductName(), r.getStatus()))
                .collect(Collectors.joining("\n"));
    }
}
