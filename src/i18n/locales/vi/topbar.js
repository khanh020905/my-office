// The phone modal and the "waiting for approval" notifications (src/office/ui/topbar.js).
export default {
  waitTitle: '{name} đang chờ bạn duyệt',
  waitBody: 'Claude cần bạn xác nhận',
  phone: {
    scan: 'Điện thoại và {mac} cùng một mạng wifi. Quét mã bằng camera:',
    orType: 'Hoặc gõ',
    thenPin: 'rồi nhập mã',
    viewOnly: 'Điện thoại chỉ xem được, không duyệt quyền được. Đổi mã (đăng xuất mọi điện thoại): my-office pin --new',
    localOnly: 'My Office đang chỉ mở cho chính {mac} này. Muốn xem trên điện thoại cùng mạng wifi, chạy lệnh dưới trong Terminal rồi mở lại nút này:',
    lanNote: 'Điện thoại vào bằng mã QR hoặc mã PIN 6 số, chỉ xem được. Chỉ bật ở mạng nhà hoặc mạng tin cậy.',
  },
  bellBlocked: 'Trình duyệt chưa cho phép gửi thông báo.',
  bellOn: 'Sẽ báo khi có session chờ bạn duyệt.',
  bellOff: 'Đã tắt thông báo.',
};
