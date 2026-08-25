# dsh-done-sound

DeepSeek Harness Web GUI 鐨勩€屽璇濆畬鎴愰煶鏁堛€嶆彃浠讹細浣犲湪璁剧疆閲岄€変竴娈甸煶棰戯紝姣忔 Agent 瀹屾暣缁撴潫涓€杞璇濇椂鑷姩鎾斁鎻愮ず闊炽€?
## 鍔熻兘

- **璁剧疆鍗＄墖**锛堣缃?鈫?瀵硅瘽瀹屾垚闊虫晥锛夛細閫夋嫨闊抽鏂囦欢锛坢p3 / wav / ogg / webm / m4a / aac / flac锛屸墹2MB锛夈€佽瘯鍚€佹竻闄ゃ€侀煶閲忚皟鑺傘€?- **瀹屾垚妫€娴?*锛氫互瀹夸富 `turn/end` 浜嬩欢鐨?reason锛堟甯?涓柇/鍑洪敊/瓒呴暱锛変负鏉冨▉瑙﹀彂淇″彿锛屽揩鎱㈠璇濋兘涓嶆紡銆佷笉璇垽锛涙瘡杞彧鍝嶄竴娆°€?- **瑙﹀彂寮€鍏?*锛?  - `涓柇鏃朵篃鍝峘锛堥粯璁?*鍏?*锛夛細鎵嬪姩鍋滄鐢熸垚鏃舵槸鍚︿篃鎾斁銆?  - `鍑洪敊鏃朵篃鍝峘锛堥粯璁?*寮€**锛夛細瀵硅瘽浠ラ敊璇粨鏉燂紙turn-error / 瓒呴暱鎴柇锛夋椂鏄惁涔熸挱鏀俱€?- 闊抽鏂囦欢淇濆瓨鍦?profile 鐩綍 `.dsh-done-sound/`锛岀粡 Host 璺敱 `/dsh-done-sound/audio/<fileId>` 鎾斁锛岄厤缃寔涔呭寲鍦ㄨ缃腑銆?
## 瀹夎

```sh
dsh plugin --profile web add dsh-done-sound
```

鏈湴寮€鍙戯細

```sh
dsh plugin --profile web add link:F:\0.AI-CodeProject\DSHProject\0.鏃ュ父鑱婂ぉ\dsh-done-sound
```

瀹夎鍚庨噸鍚?`dsh web`锛屾墦寮€璁剧疆椤靛嵆鍙湅鍒般€屽璇濆畬鎴愰煶鏁堛€嶅崱鐗囥€?
## 鏋舵瀯

- **Host 鍗婂尯**锛坄src/index.js` 鈫?鏋勫缓浜х墿 `lib/index.js`锛夛細`dsh-done-sound` 璁剧疆浣滅敤鍩燂紙`ctx.settings`锛夈€侀煶棰戞枃浠跺瓨鍌ㄣ€乣webServer` 璺敱涓庡悓婧?JSON API锛坄/dsh-done-sound/api/status|config|audio|clear`锛夈€乣dsh-done-sound` 鍛戒护銆傝矾鐢辩粡 `ctx.inject(['webServer'], cb)` 寤惰繜鎸傝浇锛涙瀯寤烘椂鐢?esbuild 鍐呰仈 `@deepseek-ai/schemastery`锛屼骇鐗╄嚜鍖呭惈锛坙ink 瀹夎鏃舵棤闇€渚濊禆 profile 鐨勬ā鍧楄В鏋愶級銆?- **Client 鍗婂尯**锛坄lib/client.js`锛夛細`settings.section` 璁剧疆鍗＄墖锛?*fetch 璋?HTTP API锛屼笉渚濊禆浼氳瘽/鍛戒护 RPC**锛? `conversation.session.header.utilities` 瀹屾垚妫€娴嬪櫒锛坄useSession` 璁㈤槄 `ConversationSnapshot`锛宍partial/running 鈫?绌洪棽` 杞Щ瑙﹀彂锛屾寜鏈€鍚庤妭鐐?seq 鍘婚噸锛夈€?
## 寮€鍙?
```sh
pnpm install        # 瀹夎 esbuild
pnpm run build      # 鎵撳寘 src/index.js -> lib/index.js锛堣嚜鍖呭惈锛?pnpm run check      # 璇硶妫€鏌ヤ袱涓骇鐗?```

淇敼 host 婧愮爜鍚庨噸鏂?`pnpm run build`锛沜lient 鍗婂尯鐩存帴鏀?`lib/client.js`锛坄__ModuleLoader__` 鏍煎紡鍗宠繍琛屾椂濂戠害锛屾棤闇€鎵撳寘锛夈€?
## 闊虫晥搴撲笅杞?
鍐呯疆鎻愮ず闊充笉澶熺敤锛熺ぞ鍖虹簿閫夐煶鑹插簱锛堢櫨搴︾綉鐩橈紝姘镐箙鏈夋晥锛夛細

- 閾炬帴锛歨ttps://pan.baidu.com/s/1xnef4xkCy8pkooXMGi2ApQ?pwd=1234
- 鎻愬彇鐮侊細1234

涓嬭浇瑙ｅ帇鍚庯紝鍦?璁剧疆 鈫?瀵硅瘽瀹屾垚闊虫晥 鈫?閫夋嫨闊抽 涓€夌敤鍗冲彲銆?
## License

MIT
