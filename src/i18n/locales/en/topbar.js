// The phone modal and the "waiting for approval" notifications (src/office/ui/topbar.js).
export default {
  waitTitle: '{name} is waiting for your approval',
  waitBody: 'Claude needs you to confirm',
  phone: {
    scan: 'Your phone and {mac} need to be on the same Wi-Fi. Scan the code with your camera:',
    orType: 'Or go to',
    thenPin: 'and enter the PIN',
    viewOnly: "Phones can watch but can't approve permissions. To change the PIN (signs out every phone): my-office pin --new",
    localOnly: 'My Office is only open to this {mac} right now. To watch on a phone on the same Wi-Fi, run the command below in Terminal, then press this button again:',
    lanNote: 'Phones get in with the QR code or a 6-digit PIN and can only watch. Only turn this on at home or on a network you trust.',
  },
  bellBlocked: "Your browser hasn't allowed notifications yet.",
  bellOn: "You'll be notified when a session is waiting for your approval.",
  bellOff: 'Notifications are off.',
};
