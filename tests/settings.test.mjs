import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeSettings} from '../src/shell.mjs';
test('floating controls recover from invalid settings without losing all tools',()=>{
 const s=normalizeSettings({favorites:['unknown'],size:900,side:'bad',icon:'<script>',color:'url(x)',y:200,opacity:.1,orientation:'bad'});
 assert.deepEqual(s.favorites,['pen','rect','eraser','text']);assert.equal(s.size,52);assert.equal(s.icon,'pen');assert.equal(s.color,'#5557D9');assert.equal(s.y,.9);assert.equal(s.opacity,.55);assert.equal(s.orientation,'portrait');
});
test('favorite tools are unique, validated and limited to six',()=>{
 const s=normalizeSettings({favorites:['pen','pen','rect','circle','line','arrow','text','laser'],orientation:'landscape',side:'left',size:44});
 assert.equal(s.favorites.length,6);assert.equal(new Set(s.favorites).size,6);assert.equal(s.side,'left');assert.equal(s.size,44);assert.equal(s.orientation,'landscape');
});
