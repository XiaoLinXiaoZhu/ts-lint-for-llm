# Impure

依赖隐式环境——时间、随机数、全局变量。

传播不可阻断：caller 调了带 Impure 的 callee，就必须声明 Impure，没有阻断语法。

只能手动声明，无【自动检测】。降低 Impure 负担的方式是参数注入重构——将 `Date.now()` 改为传入参数。

【内置能力表】中声明了 Impure 的典型 API：Math.random, Date.now, setTimeout, setInterval, process.cwd, process.argv。
