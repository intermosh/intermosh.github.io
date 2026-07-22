#!/bin/bash
urls=(
"https://alsgp0.fds.api.xiaomi.com/chatbot-prod/multimedia/6882096149/ai-shared-41add0cdbeb79bd16e3ea4e597e079f1.js?GalaxyAccessKeyId=AKDFVGPIRVU2J5L22P&Expires=1816228885040&Signature=2+LDd4mH0ze3DsewMCOkAKqoc78="
"https://alsgp0.fds.api.xiaomi.com/chatbot-prod/multimedia/6882096149/ai-worker-dbfb37504060f47977445d46c60bd99e.js?GalaxyAccessKeyId=AKDFVGPIRVU2J5L22P&Expires=1816228885038&Signature=0zpwo7xsMy3cG/LsU68L2zvaiGc="
"https://alsgp0.fds.api.xiaomi.com/chatbot-prod/multimedia/6882096149/db-fb4cf110e770f5721e6c4bd25c4156c3.js?GalaxyAccessKeyId=AKDFVGPIRVU2J5L22P&Expires=1816228885046&Signature=rLkJbI5Xl6SCAQ0/52NrDqPB5SI="
"https://alsgp0.fds.api.xiaomi.com/chatbot-prod/multimedia/6882096149/diagnostics-3b50b01acdbd5b8869acc247871080b3.js?GalaxyAccessKeyId=AKDFVGPIRVU2J5L22P&Expires=1816228885054&Signature=Q4iBiULRle6955yjpuTaJeFH5ms="
"https://alsgp0.fds.api.xiaomi.com/chatbot-prod/multimedia/6882096149/export-import-3d79358e8c7193228284253f3ef962a3.js?GalaxyAccessKeyId=AKDFVGPIRVU2J5L22P&Expires=1816228885056&Signature=Q/Nmp3u3CAfhpDQFMXFBJGLl6OU="
"https://alsgp0.fds.api.xiaomi.com/chatbot-prod/multimedia/6882096149/index-3bd114388445c3692f65a024b241f714.html?GalaxyAccessKeyId=AKDFVGPIRVU2J5L22P&Expires=1816228885062&Signature=cIooaGDqjd2sg2Iy9PupK5urin4="
"https://alsgp0.fds.api.xiaomi.com/chatbot-prod/multimedia/6882096149/main-3deb03c430be872c99e143d15f727d59.js?GalaxyAccessKeyId=AKDFVGPIRVU2J5L22P&Expires=1816228885070&Signature=gki/i9svTiKu1amemUGwVzQSdFA="
"https://alsgp0.fds.api.xiaomi.com/chatbot-prod/multimedia/6882096149/render-d28e1aa7a066afb1d25504b24e330043.js?GalaxyAccessKeyId=AKDFVGPIRVU2J5L22P&Expires=1816228885078&Signature=n8Faou/GqhNdOCev+hFZgvy77Wg="
"https://alsgp0.fds.api.xiaomi.com/chatbot-prod/multimedia/6882096149/7c3fcdfe-7467-42a9-820e-097070927b79.js?GalaxyAccessKeyId=AKDFVGPIRVU2J5L22P&Expires=1816228885085&Signature=uFKTBM5uK5ds2NMMt1DewUk5L0A="
"https://alsgp0.fds.api.xiaomi.com/chatbot-prod/multimedia/6882096149/8d026e62-7d5b-42e3-862a-71c9ec86aa7d.js?GalaxyAccessKeyId=AKDFVGPIRVU2J5L22P&Expires=1816228885090&Signature=PlkHisUKSLmzFU1meHkoC31n0to="
"https://alsgp0.fds.api.xiaomi.com/chatbot-prod/multimedia/6882096149/scoring-88cd99a86293c25013f7723d7f1b0795.js?GalaxyAccessKeyId=AKDFVGPIRVU2J5L22P&Expires=1816228885094&Signature=44wKg4rreW+j8qEd08jZ8gkW7Pg="
"https://alsgp0.fds.api.xiaomi.com/chatbot-prod/multimedia/6882096149/47b449e0-1981-4648-b55c-8134e6d2f58b.js?GalaxyAccessKeyId=AKDFVGPIRVU2J5L22P&Expires=1816228885096&Signature=+tEq4K8wZb3An6WHzMr9WQvtpGU="
"https://alsgp0.fds.api.xiaomi.com/chatbot-prod/multimedia/6882096149/state-5160ea24d09ed7314a9b64d2a5f0d1ce.js?GalaxyAccessKeyId=AKDFVGPIRVU2J5L22P&Expires=1816228885104&Signature=MNYbYM91Pi/Zw+7OH63dRU3LVdk="
"https://alsgp0.fds.api.xiaomi.com/chatbot-prod/multimedia/6882096149/styles-687e6624b60ea85ce8a37ee7179b9e5b.css?GalaxyAccessKeyId=AKDFVGPIRVU2J5L22P&Expires=1816228885104&Signature=Jc7SwmVQF6bfYQZ9p7fhn0SZ8ec="
"https://alsgp0.fds.api.xiaomi.com/chatbot-prod/multimedia/6882096149/sw-57f694f2cb770d6820bdf19d8bdbbf98.js?GalaxyAccessKeyId=AKDFVGPIRVU2J5L22P&Expires=1816228885113&Signature=A47Kc/DhYnYdhfz8WNCIoKTYhDM="
"https://alsgp0.fds.api.xiaomi.com/chatbot-prod/multimedia/6882096149/workers-2ee4f7ef8178ddf77fef3c7375ead0dc.js?GalaxyAccessKeyId=AKDFVGPIRVU2J5L22P&Expires=1816228885124&Signature=rWj3MeaFcN2g81HhYmVIkoziN8s="
"https://alsgp0.fds.api.xiaomi.com/chatbot-prod/multimedia/6882096149/0278970d-0fbd-44b8-a892-b598802b21d6.md?GalaxyAccessKeyId=AKDFVGPIRVU2J5L22P&Expires=1816228919180&Signature=nfqsPzEbq3JDNFNvxuP4Km0wYg4="
"https://alsgp0.fds.api.xiaomi.com/chatbot-prod/multimedia/6882096149/README-57a21da21c8a5dc86e04b2a3a4d8e518.md?GalaxyAccessKeyId=AKDFVGPIRVU2J5L22P&Expires=1816228919176&Signature=HxSbpxMk2TdOvlCpzU6eNx/ltnc="
)
names=(
"ai-shared.js"
"ai-worker.js"
"db.js"
"diagnostics.js"
"export-import.js"
"index.html"
"main.js"
"render.js"
"retention-engine.js"
"retention-worker.js"
"scoring.js"
"sentiment-worker.js"
"state.js"
"styles.css"
"sw.js"
"workers.js"
"scriptlab-v5-contract.md"
"README.md"
)
for i in "${!urls[@]}"; do
  curl -sL "${urls[$i]}" -o "${names[$i]}" &
done
wait
echo "Done. Downloaded ${#names[@]} files."
ls -la
