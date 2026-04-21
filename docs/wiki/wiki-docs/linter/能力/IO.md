# IO

读写外部系统（网络、文件、数据库）。

传播不可阻断：caller 调了带 IO 的 callee，就必须声明 IO，没有阻断语法。

只能手动声明，无【自动检测】。降低 IO 负担的方式是缩小携带面积——把 IO 代码集中到更少的函数里。

【内置能力表】中声明了 IO 的典型 API：console.log/warn/error/info/debug, fetch, readFileSync, writeFileSync, emit, serve 等。
