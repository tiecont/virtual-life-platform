'use client';
import type { Me,TravelSource } from '@virtual-city/contracts';
import { restaurantServicePolicy } from '@virtual-city/restaurant-world';
import VoluntaryStaffControls from '../../../../hospitality/modules/hospitality/presentation/VoluntaryStaffControls';
export default function RestaurantStaff({me,source}:{me:Me;source:TravelSource|null}){return <VoluntaryStaffControls me={me} source={source} worldSlug="restaurant" venue="restaurant" policy={restaurantServicePolicy} introduction="View selection does not start a shift. Start or switch explicitly. Changing your work role returns unfinished assigned orders to the queue;it never extends the original four-hour shift. Dining remains available without a shift." footer="Up to two voluntary workers share this room's existing capacity. Stop is available outside the room and during a pending response. Staff status observations expire after 30 seconds. Service actions require a menu offered for this visit."/>;}
