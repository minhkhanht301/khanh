# HN AI – Trợ lý học tập Việt Nam

HN AI là bản phát triển thử nghiệm dành cho việc học tập tiếng Việt, ưu tiên học sinh lớp 6–9. Giao diện kết hợp cảm hứng Việt Nam hiện đại với phong cách công nghệ.

## Tính năng trong bản đầu tiên
- Giao diện responsive cho máy tính, máy tính bảng và điện thoại.
- Đăng nhập Google bằng Google Identity Services.
- Hồ sơ học tập tùy chọn, có thể bỏ qua.
- Chat và lưu lịch sử bằng Cloudflare D1.
- Đính kèm ảnh JPG/PNG/WebP tối đa 4 MB để mô hình Vision phân tích.
- Trả lời theo hướng dễ hiểu, tôn trọng, có gợi ý học tiếp.
- API kiểm tra trạng thái tại /api/health.

## Công nghệ
- Cloudflare Workers + Workers AI
- Cloudflare D1
- HTML, CSS, JavaScript thuần

## Triển khai thử nghiệm tách biệt
Nhánh Git: hn-ai-v1. Worker preview: hn-ai-preview. Dự án này được cấu hình dùng D1 riêng, không dùng cơ sở dữ liệu KHANH AI hiện tại.

1. Trong Cloudflare Dashboard, tạo D1 database mới tên hn-ai-db.
2. Thay REPLACE_WITH_NEW_HN_AI_D1_DATABASE_ID trong wrangler.toml bằng ID của database vừa tạo. Không dùng ID database của KHANH AI.
3. Trong Google Cloud Console, thêm URL preview HN AI vào Authorized JavaScript origins của OAuth Web Client đang dùng. Không chia sẻ client secret.
4. Chạy npm install.
5. Chạy npx wrangler d1 migrations apply hn-ai-db --remote để tạo bảng.
6. Kiểm tra binding Workers AI tên AI đã được bật.
7. Đồng ý Meta License và Acceptable Use Policy trước lần gọi đầu tiên tới mô hình Vision theo hướng dẫn chính thức của Cloudflare.
8. Chạy npx wrangler deploy để triển khai worker preview riêng.

## Giới hạn cần biết
- Tìm kiếm Internet trực tiếp và trích dẫn nguồn chưa được tích hợp. Không được tuyên bố đã tra Google khi chưa có công cụ tìm kiếm hoạt động.
- Ảnh gửi lên được chuyển tới mô hình để phân tích, hiện chưa lưu trong lịch sử D1.
- Workers AI có hạn mức và mức tính phí thay đổi theo tài khoản/model. Đặc biệt mô hình Vision không nên được xem là miễn phí vô hạn; kiểm tra bảng giá và giới hạn hiện hành trước khi bật công khai.
- AI có thể sai. Cần đánh giá bằng bộ câu hỏi có đáp án chuẩn, kiểm tra nguồn và thử nghiệm bảo mật trước khi dự thi hoặc công khai.
- Trước khi mời người dùng thật, hãy nhờ người lớn hỗ trợ rà soát điều khoản dịch vụ, chính sách riêng tư, bảo vệ dữ liệu, giới hạn sử dụng và cách liên hệ hỗ trợ.
