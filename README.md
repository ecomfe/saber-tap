# saber-tap

一个让移动端支持无延迟点击的小模块，基于 `[FastClick](https://github.com/ftlabs/fastclick)`。

*This project is forked from `ftlabs/fastclick`*

## 前提

使用 `saber-tap` 之前需要满足下列条件：

- viewport 必须设置了 `user-scalable=no`
- 只支持使用 webkit 内核的手机、平板设备浏览器

## 使用方法

在满足以上 **前提** 时：

```javascript
// 使用前引入 `saber-tap` 模块
var Tap = require( 'saber-tap' );

// 特定范围内应用无延迟点击
var layer = document.querySelector( '#container' );
Tap.mixin( layer );

// 若想全局应用，可在 `domready` 时传入 `body`
window.addEventListener( 'load', function() {
    Tap.mixin( document.body );
});

// 搞定之后绑定的 click 事件就没有延迟了
el.addEventListener( 'click', clickHandler );
```

因为 `Tap` 会在给定的 `layer` 上使用事件委托，为防止大范围的 `tap-highlight`，推荐加上：

```css
body {
    -webkit-tap-highlight-color: rgba(0,0,0,0);
}
```

如不想全局使用，可将 `body` 换为 `layer` 对应的 CSS Selector。
