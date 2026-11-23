import {createDeadlineWorld} from '@aetheria/deadline-world';
import {createMaidWorld} from '@aetheria/maid-world';
import {createLibraryWorld} from '@aetheria/library-world';
import {createRestaurantWorld} from '@aetheria/restaurant-world';
import {createParkWorld} from '@aetheria/park-world';
import {createLoungeWorld} from '@aetheria/lounge-world';
// Curated production-capable factories. No sandbox, fixture or real dating installer.
export const worldInstallers={deadline:createDeadlineWorld,maid:createMaidWorld,library:createLibraryWorld,restaurant:createRestaurantWorld,park:createParkWorld,lounge:createLoungeWorld};
