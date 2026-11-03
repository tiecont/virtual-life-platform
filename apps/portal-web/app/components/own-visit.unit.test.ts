import { it,expect } from 'vitest';
import type { WorldCard } from '@virtual-city/contracts';
import { ownVisitLabel } from './own-visit';
it('labels only own approved public visit and conceals hidden or separately protected context',()=>{
 const world:WorldCard={slug:'sdk-sandbox',version:'1.0.0',title:'Local cafe',kind:'sandbox',sceneRef:{key:'sdk-sandbox',version:'1.0.0'},capacity:8,capabilities:['presence'],map:{region:'sandbox',position:{x:.5,y:.5},icon:'flask'},accessHint:'session-required',availability:'available',discoverability:'listed'};
 expect(ownVisitLabel(null,[world])).toBe('No confirmed visit');expect(ownVisitLabel({worldSlug:world.slug},[world])).toBe(world.title);expect(ownVisitLabel({worldSlug:'dating'},[world])).toBe('Private visit');expect(ownVisitLabel({worldSlug:world.slug},[{...world,accessHint:'permission-required'}])).toBe('Private visit');expect(ownVisitLabel({worldSlug:world.slug},[])).toBe('Private visit');
});
