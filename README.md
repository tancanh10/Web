# Naphutech Inventory & BOM

Ứng dụng web tĩnh dùng Netlify để phân phối giao diện, Supabase Auth để đăng nhập và Supabase Database để lưu một không gian làm việc chung cho cả nhóm. Tùy chọn giao diện/ngôn ngữ vẫn được lưu riêng trên trình duyệt; kho, BOM, dự án, lịch, To-do, ghi chú và hướng dẫn được chia sẻ giữa các tài khoản đã đăng nhập.

## Triển khai lần đầu

### 1. Tạo Supabase project

1. Tạo project tại [supabase.com](https://supabase.com/).
2. Mở **SQL Editor**, chạy toàn bộ nội dung [`supabase/schema.sql`](./supabase/schema.sql). Schema tạo bảng dữ liệu dùng chung, các chính sách RLS và RPC khởi tạo/cập nhật dữ liệu; Realtime cần được bật cho bảng này.
3. Trong **Authentication → Providers**, bật Email. Tắt **Allow new users to sign up** để người dùng không thể tự đăng ký.
4. Trong **Authentication → URL Configuration**, đặt Site URL là URL Netlify sau khi deploy và thêm URL đó (cùng URL preview nếu dùng) vào danh sách Redirect URLs.
5. Lấy **Project URL** và **anon/public key** tại **Project Settings → API**. Chỉ dùng anon/public key ở frontend; tuyệt đối không đưa `service_role` key vào biến môi trường build frontend hoặc commit vào mã nguồn.

### 2. Deploy lên Netlify

1. Import repository/thư mục dự án vào Netlify.
2. Đặt hai biến môi trường cho build:
   - `SUPABASE_URL`: Project URL của Supabase.
   - `SUPABASE_ANON_KEY`: anon/public key của Supabase.
3. Deploy. [`netlify.toml`](./netlify.toml) chạy `node scripts/generate-supabase-config.js`; script kiểm tra cấu hình và tạo thư mục `dist` chỉ với các tệp giao diện cần thiết cùng `supabase-config.js`.
4. Sau khi biết URL Netlify, cập nhật Site URL/Redirect URLs trong Supabase và deploy lại nếu cần.

Không mở `index.html` trực tiếp từ ổ đĩa nữa: ứng dụng cần được phục vụ qua Netlify (hoặc máy chủ web) và cần cấu hình Supabase hợp lệ. Nếu thiếu biến môi trường, màn hình đăng nhập sẽ chỉ ra lỗi cấu hình.

## Mời thành viên và đăng nhập

- Chủ sở hữu/quản trị viên dự án Supabase mời thành viên qua **Authentication → Users → Invite user**. Tài khoản chỉ được tạo bởi người có quyền quản trị Supabase; ứng dụng không cung cấp đăng ký công khai hay màn hình quản trị thành viên.
- Thành viên đăng nhập bằng email và mật khẩu được thiết lập theo lời mời.
- Tất cả tài khoản đã được mời đều có quyền làm việc trên cùng dữ liệu chung; hiện chưa có phân quyền theo vai trò trong ứng dụng.
- Thành viên đăng nhập không thể truy cập bảng dữ liệu nếu chưa xác thực. RLS giới hạn dữ liệu vào các phiên đã đăng nhập, không thay thế quy trình bảo vệ tài khoản Supabase.

## Chuyển dữ liệu trình duyệt cũ

Lần đầu tiên workspace được khởi tạo trên Supabase, ứng dụng lấy dữ liệu hiện có trong localStorage của trình duyệt đang đăng nhập và lưu làm dữ liệu chung. Vì vậy, hãy deploy ứng dụng, đăng nhập lần đầu trên máy/trình duyệt đang giữ dữ liệu cần chuyển, rồi chờ đồng bộ hoàn tất trước khi các thành viên khác sử dụng. Khi workspace đã khởi tạo, dữ liệu trên Supabase là nguồn chung; dữ liệu cục bộ của trình duyệt mới sẽ được thay bằng dữ liệu chung khi đăng nhập.

Nên sao lưu dữ liệu quan trọng trước khi chuyển. Việc sửa cùng một mục/danh sách đồng thời trên nhiều trình duyệt có thể tạo ra ghi đè ở cấp khóa dữ liệu; hệ thống hiện đồng bộ theo từng danh sách, chưa có xử lý hợp nhất từng bản ghi.

## Phát triển cục bộ

Để tạo bản build tương tự Netlify, đặt `SUPABASE_URL` và `SUPABASE_ANON_KEY` trong môi trường rồi chạy:

```sh
node scripts/generate-supabase-config.js
```

Phục vụ thư mục `dist` bằng máy chủ web tĩnh. Không cần cài dependency npm để tạo build; script chỉ dùng thư viện Node.js tích hợp sẵn.

`server.js` là máy chủ Express/SQLite cũ, không được sử dụng trong cấu hình Netlify tĩnh. `dist/` là thư mục được sinh tự động và không nên chỉnh sửa trực tiếp.
