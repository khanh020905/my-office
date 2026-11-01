// Boots the office. Every module's setup() runs once, in this order (the order the page always ran in): the scene,
// the furniture and people, then the panels, the live connection and the render loop.
import * as coreEnv from './core/env.js';
import * as uiEventText from './ui/event-text.js';
import * as uiIcons from './ui/icons.js';
import * as sceneRenderer from './scene/renderer.js';
import * as sceneLights from './scene/lights.js';
import * as sceneQuality from './scene/quality.js';
import * as worldTerrace from './world/terrace.js';
import * as worldBackdropsCity from './world/backdrops/city.js';
import * as worldLayout from './world/layout.js';
import * as worldCozyRoom from './world/cozy-room.js';
import * as worldWindows from './world/windows.js';
import * as worldFurnitureRoomPieces from './world/furniture/room-pieces.js';
import * as worldFurnitureServerRacks from './world/furniture/server-racks.js';
import * as worldFurnitureRocket from './world/furniture/rocket.js';
import * as worldFurnitureBoard from './world/furniture/board.js';
import * as worldEntrance from './world/entrance.js';
import * as peopleBedding from './people/bedding.js';
import * as worldDesks from './world/desks.js';
import * as worldFurnitureMeeting from './world/furniture/meeting.js';
import * as worldFurnitureCoffee from './world/furniture/coffee.js';
import * as worldFurniturePlantsLamps from './world/furniture/plants-lamps.js';
import * as worldPropsTrinkets from './world/props/trinkets.js';
import * as worldProPieces from './world/pro/pieces.js';
import * as worldProFloor from './world/pro/floor.js';
import * as worldProWing from './world/pro/wing.js';
import * as worldPropsAquarium from './world/props/aquarium.js';
import * as worldPropsArcade from './world/props/arcade.js';
import * as worldPropsPrinter from './world/props/printer.js';
import * as worldPropsTv from './world/props/tv.js';
import * as worldPropsGameTv from './world/props/game-tv.js';
import * as worldPropsBilliards from './world/props/billiards.js';
import * as worldPropsKaraoke from './world/props/karaoke.js';
import * as worldPropsNeon from './world/props/neon.js';
import * as worldPropsStringLights from './world/props/string-lights.js';
import * as worldPropsCat from './world/props/cat.js';
import * as worldPropsVacuum from './world/props/vacuum.js';
import * as worldPropsBins from './world/props/bins.js';
import * as worldPropsShredder from './world/props/shredder.js';
import * as worldPropsCups from './world/props/cups.js';
import * as worldPropsDevServers from './world/props/dev-servers.js';
import * as worldPropsSwitches from './world/props/switches.js';
import * as worldPropsMicrowave from './world/props/microwave.js';
import * as worldPropsDutyBoard from './world/props/duty-board.js';
import * as interactRings from './interact/rings.js';
import * as peopleNavigation from './people/navigation.js';
import * as peopleBreaks from './people/breaks.js';
import * as peopleLook from './people/look.js';
import * as peopleWorkers from './people/workers.js';
import * as peopleTeamLines from './people/team-lines.js';
import * as peopleDirector from './people/director.js';
import * as peopleErrands from './people/errands.js';
import * as peopleGatherings from './people/gatherings.js';
import * as peopleOutings from './people/outings.js';
import * as peopleComnha from './people/comnha.js';
import * as peopleDuty from './people/duty.js';
import * as peopleStaff from './people/staff.js';
import * as peopleTeatime from './people/teatime.js';
import * as peopleAccountant from './people/accountant.js';
import * as peopleRounds from './people/rounds.js';
import * as peopleGuard from './people/guard.js';
import * as peopleHr from './people/hr.js';
import * as peopleFoosball from './people/foosball.js';
import * as peopleGaming from './people/gaming.js';
import * as peopleBilliards from './people/billiards.js';
import * as peopleKaraoke from './people/karaoke.js';
import * as peopleFarewell from './people/farewell.js';
import * as peopleInterns from './people/interns.js';
import * as lifeTrophies from './life/trophies.js';
import * as lifeSeasons from './life/seasons.js';
import * as lifeRain from './life/rain.js';
import * as lifeWeather from './life/weather.js';
import * as lifeNap from './life/nap.js';
import * as lifeQuota from './life/quota.js';
import * as lifeAltar from './life/altar.js';
import * as lifeLiftService from './life/lift-service.js';
import * as lifeDrill from './life/drill.js';
import * as lifeTests from './life/tests.js';
import * as lifePhotostrips from './life/photostrips.js';
import * as lifePost from './life/post.js';
import * as uiLite from './ui/lite.js';
import * as worldRoomUpdate from './world/room-update.js';
import * as uiActivity from './ui/activity.js';
import * as uiSessionDrawer from './ui/session-drawer.js';
import * as uiCameraBar from './ui/camera-bar.js';
import * as uiMacDrawer from './ui/mac-drawer.js';
import * as uiBurn from './ui/burn.js';
import * as uiTopbar from './ui/topbar.js';
import * as interactProps from './interact/props.js';
import * as interactPlaceChips from './interact/place-chips.js';
import * as interactPlaceCards from './interact/place-cards.js';
import * as uiWhiteboard from './ui/whiteboard.js';
import * as uiLookSwitch from './ui/look-switch.js';
import * as uiSettings from './ui/settings.js';
import * as uiWrapped from './ui/wrapped.js';
import * as uiPhoto from './ui/photo.js';
import * as uiTimelapse from './ui/timelapse.js';
import * as uiGroupChat from './ui/group-chat.js';
import * as uiGroupChatView from './ui/group-chat-view.js';
import * as uiStuck from './ui/stuck.js';
import * as uiCacheWords from './ui/cache-words.js';
import * as uiTips from './ui/tips.js';
import * as interactFirstPerson from './interact/first-person.js';
import * as netLive from './net/live.js';
import * as lifeYourTurn from './life/your-turn.js';
import * as lifeIncidents from './life/incidents.js';
import * as audioSfx from './audio/sfx.js';
import * as uiPermissions from './ui/permissions.js';
import * as uiPhone from './ui/phone.js';
import * as uiNotify from './ui/notify.js';
import * as demoDemo from './demo/demo.js';
import * as replayReplay from './replay/replay.js';
import * as replayTimeline from './replay/timeline.js';
import * as worldBackdropsIndex from './world/backdrops/index.js';
import * as coreLoop from './core/loop.js';
import * as coreOptimize from './core/optimize.js';

const MODULES = [
  coreEnv,
  uiEventText,
  uiIcons,
  sceneRenderer,
  sceneLights,
  sceneQuality,
  worldTerrace,
  worldBackdropsCity,
  worldLayout,
  worldCozyRoom,
  worldWindows,
  worldFurnitureRoomPieces,
  worldFurnitureServerRacks,
  worldFurnitureRocket,
  worldFurnitureBoard,
  worldEntrance,
  peopleBedding,
  worldDesks,
  worldFurnitureMeeting,
  worldFurnitureCoffee,
  worldFurniturePlantsLamps,
  worldPropsTrinkets,
  worldProPieces,
  worldProFloor,
  worldProWing,
  worldPropsAquarium,
  worldPropsArcade,
  worldPropsPrinter,
  worldPropsTv,
  worldPropsGameTv,
  worldPropsBilliards,
  worldPropsKaraoke,
  worldPropsNeon,
  worldPropsStringLights,
  worldPropsCat,
  worldPropsVacuum,
  worldPropsBins,
  worldPropsShredder,
  worldPropsCups,
  worldPropsDevServers,
  worldPropsSwitches,
  worldPropsMicrowave,
  worldPropsDutyBoard,
  interactRings,
  peopleNavigation,
  peopleBreaks,
  peopleLook,
  peopleWorkers,
  peopleTeamLines,
  peopleDirector,
  peopleErrands,
  peopleGatherings,
  peopleOutings,
  peopleComnha,
  peopleStaff,
  peopleDuty,
  peopleTeatime,
  peopleAccountant,
  peopleRounds,
  peopleGuard,
  peopleHr,
  peopleFoosball,
  peopleGaming,
  peopleBilliards,
  peopleKaraoke,
  peopleFarewell,
  peopleInterns,
  lifeTrophies,
  lifeSeasons,
  lifeRain,
  lifeWeather,
  lifeNap,
  lifeQuota,
  lifeAltar,
  lifeLiftService,
  lifeDrill,
  lifeTests,
  lifePhotostrips,
  lifePost,
  uiLite,
  worldRoomUpdate,
  uiActivity,
  uiSessionDrawer,
  uiCameraBar,
  uiMacDrawer,
  uiBurn,
  uiTopbar,
  interactProps,
  interactPlaceChips,
  interactPlaceCards,
  uiWhiteboard,
  uiLookSwitch,
  uiSettings,
  uiWrapped,
  uiPhoto,
  uiTimelapse,
  uiGroupChat,
  uiGroupChatView,
  uiStuck,
  uiCacheWords,
  uiTips,
  interactFirstPerson,
  netLive,
  lifeYourTurn,
  lifeIncidents,
  audioSfx,
  uiPermissions,
  uiPhone,
  uiNotify,
  demoDemo,
  replayReplay,
  replayTimeline,
  worldBackdropsIndex,
  coreLoop,
  coreOptimize,
];

let started = false;
export function startOffice() {
  if (started) return;
  started = true;
  for (const m of MODULES) m.setup();
}
