import test from 'node:test';
import {execFileSync} from 'node:child_process';
test('native makeup source reader preserves signed defaults, palette and BC blocks',()=>{
 execFileSync('python3',['-B','-m','unittest','discover','-s','tools/photo-mode','-p','test_native_makeup.py'],{stdio:'pipe',timeout:30000});
});
