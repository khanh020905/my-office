import TopBar from '@/components/office/TopBar';
import SessionRail from '@/components/office/SessionRail';
import Stage from '@/components/office/Stage';
import ActivityPanel from '@/components/office/ActivityPanel';
import SessionDrawer from '@/components/office/SessionDrawer';
import MacDrawer from '@/components/office/MacDrawer';
import BurnDrawer from '@/components/office/BurnDrawer';
import PhoneModal from '@/components/office/PhoneModal';
import WrappedModal from '@/components/office/WrappedModal';
import Toast from '@/components/office/Toast';
import OfficeBoot from '@/components/OfficeBoot';

// Rendered on every request (the components read the office's language from the request headers): the server in
// front of Next decides who may see it. The static demo build renders it once instead.
export default function OfficePage() {
  return (
    <div id="app">
      <TopBar />
      <SessionRail />
      <Stage />
      <ActivityPanel />
      <SessionDrawer />
      <MacDrawer />
      <BurnDrawer />
      <PhoneModal />
      <WrappedModal />
      <Toast />
      <OfficeBoot />
    </div>
  );
}
