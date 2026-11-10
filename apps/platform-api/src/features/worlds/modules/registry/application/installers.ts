import {createDeadlineWorld} from '@virtual-city/deadline-world';
import {createMaidWorld} from '@virtual-city/maid-world';
import {createLibraryWorld} from '@virtual-city/library-world';
import {createRestaurantWorld} from '@virtual-city/restaurant-world';
import {createParkWorld} from '@virtual-city/park-world';
import {createLoungeWorld} from '@virtual-city/lounge-world';
// Curated production-capable factories. No sandbox, fixture or real dating installer.
export const worldInstallers={deadline:createDeadlineWorld,maid:createMaidWorld,library:createLibraryWorld,restaurant:createRestaurantWorld,park:createParkWorld,lounge:createLoungeWorld};
