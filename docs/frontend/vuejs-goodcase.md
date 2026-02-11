# vuejs 封装技巧


vuejs 在运行时采用vdom方案的框架，在写vue sfc的时候其实我们还是在写js。在开发vue应用过程中通常需要对逻辑进行拆分，我在使用vue的过程中总结出几种封装技巧。

下面列子都以请求用户信息为例进行封装说明。

## mixins

类似 `Object.assign` 将 vue 组件配置组合在一起。

### 使用

[sfc playground](https://sfc.vuejs.org/#eyJBcHAudnVlIjoiPHRlbXBsYXRlPlxuICA8VXNlQ2FzZTEgLz5cbjwvdGVtcGxhdGU+XG48c2NyaXB0IGxhbmc9XCJ0c1wiPlxuaW1wb3J0IHsgZGVmaW5lQ29tcG9uZW50IH0gZnJvbSBcInZ1ZVwiXG5pbXBvcnQgVXNlQ2FzZTEgZnJvbSBcIi4vVXNlQ2FzZTEudnVlXCJcbmV4cG9ydCBkZWZhdWx0IGRlZmluZUNvbXBvbmVudCh7XG4gIGNvbXBvbmVudHM6IHsgVXNlQ2FzZTEgfVxufSlcbjwvc2NyaXB0PiIsImltcG9ydC1tYXAuanNvbiI6IntcbiAgXCJpbXBvcnRzXCI6IHtcbiAgICBcInZ1ZVwiOiBcImh0dHBzOi8vc2ZjLnZ1ZWpzLm9yZy92dWUucnVudGltZS5lc20tYnJvd3Nlci5qc1wiXG4gIH1cbn0iLCJmZXRjaFVzZXJJbmZvLnRzIjoiaW1wb3J0IHsgZGVmaW5lQ29tcG9uZW50IH0gZnJvbSBcInZ1ZVwiXG5cbmV4cG9ydCBkZWZhdWx0IGRlZmluZUNvbXBvbmVudCh7XG4gICAgbWV0aG9kczoge1xuICAgICAgICBmZXRjaFVzZXJJbmZvKHBhcmFtcykge1xuICAgICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoe1xuICAgICAgICAgICAgXHRwYXJhbXMsXG4gICAgICAgICAgICBcdG5hbWU6IFwiaGVsbG9cIixcbiAgICAgICAgICAgICAgcGhvbmU6IFwiMTExMTExMTExMTFcIlxuICAgICAgICAgICB9KVxuICAgICAgICB9XG4gICAgfSxcbiAgXHRkYXRhKCkge1xuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgdXNlckluZm86IG51bGxcbiAgICAgICAgfVxuICAgIH0sXG4gICAgYXN5bmMgbW91bnRlZCgpIHtcbiAgICAgICB0aGlzLnVzZXJJbmZvID0gYXdhaXQgdGhpcy5mZXRjaFVzZXJJbmZvKHtcbiAgICAgICAgIHRva2VuOiBcIjk1MjdcIixcbiAgICAgICAgIHVpZDogXCI5NTI3XCJcbiAgICAgICB9KVxuICAgIH1cbn0pIiwiVXNlQ2FzZTEudnVlIjoiPHRlbXBsYXRlPlxuXHR1c2VjYXNlOlxuICA8cHJlPlxuICBcdHt7IHVzZXJJbmZvIH19XG4gIDwvcHJlPlxuPC90ZW1wbGF0ZT5cbjxzY3JpcHQ+XG5pbXBvcnQgeyBkZWZpbmVDb21wb25lbnQgfSBmcm9tIFwidnVlXCJcbmltcG9ydCBGZXRjaFVzZXJJbmZvIGZyb20gXCIuL2ZldGNoVXNlckluZm8udHNcIlxuXG5leHBvcnQgZGVmYXVsdCBkZWZpbmVDb21wb25lbnQoe1xuICAgIG1peGluczogWyBGZXRjaFVzZXJJbmZvIF1cbn0pXG48L3NjcmlwdD4ifQ==)

**封装**

```js
import { defineComponent } from "vue";

export default defineComponent({
  methods: {
    fetchUserInfo(params) {
      return Promise.resolve({
        params,
        name: "hello",
        phone: "11111111111",
      });
    },
  },
  data() {
    return {
      userInfo: null,
    };
  },
  async mounted() {
    this.userInfo = await this.fetchUserInfo({
      token: "9527",
      uid: "9527",
    });
  },
});
```

**使用**

```html
<template>
  usecase:
  <pre>
    {{ userInfo }}
  </pre>
</template>
<script>
  import { defineComponent } from "vue";
  import FetchUserInfo from "./fetchUserInfo.ts";

  export default defineComponent({
    mixins: [FetchUserInfo],
  });
</script>
```

### 优点

- 使用简单，封装简单。

### 缺点

- 组合后的 vue 配置将丢失类型，使用者只能进去 minix 文件里面找到方法定义才可以使用，vscode 没有办法提示也没有办法跳转。
- 在 mixins 里可以加任何代码，props、data、methods、甚至多个 minix 可以互相调用代码，就导致如果不了解 mixins 封装的代码的话很难维护。

## 无界面组件

将逻辑封装进组件，但是这个组件不产生视图，只执行逻辑和产生数据。

### 使用

[sfc playground](https://sfc.vuejs.org/#eyJBcHAudnVlIjoiPHRlbXBsYXRlPlxuICA8VXNlQ2FzZTEgLz5cbiAgPFVzZUNhc2UyIC8+XG48L3RlbXBsYXRlPlxuPHNjcmlwdCBsYW5nPVwidHNcIj5cbmltcG9ydCB7IGRlZmluZUNvbXBvbmVudCB9IGZyb20gXCJ2dWVcIlxuaW1wb3J0IFVzZUNhc2UxIGZyb20gXCIuL1VzZUNhc2UxLnZ1ZVwiXG5pbXBvcnQgVXNlQ2FzZTIgZnJvbSBcIi4vVXNlQ2FzZTIudnVlXCJcbmV4cG9ydCBkZWZhdWx0IGRlZmluZUNvbXBvbmVudCh7XG4gIGNvbXBvbmVudHM6IHsgVXNlQ2FzZTEsIFVzZUNhc2UyIH1cbn0pXG48L3NjcmlwdD4iLCJpbXBvcnQtbWFwLmpzb24iOiJ7XG4gIFwiaW1wb3J0c1wiOiB7XG4gICAgXCJ2dWVcIjogXCJodHRwczovL3NmYy52dWVqcy5vcmcvdnVlLnJ1bnRpbWUuZXNtLWJyb3dzZXIuanNcIlxuICB9XG59IiwiZmV0Y2hVc2VySW5mby50cyI6ImltcG9ydCB7IGRlZmluZUNvbXBvbmVudCwgb25Nb3VudGVkLCByZWYgfSBmcm9tIFwidnVlXCJcblxuZXhwb3J0IGRlZmF1bHQgZGVmaW5lQ29tcG9uZW50KHtcbiAgICBuYW1lOiBcIkZldGNoVXNlckluZm9cIixcbiAgICBwcm9wczoge1xuICAgICAgICBwYXJhbXM6IE9iamVjdFxuICAgIH0sXG4gICAgZW1pdHM6IFsnY2hhbmdlJ10sXG4gICAgc2V0dXAgKHByb3BzLCB7IGVtaXQsIHNsb3RzIH0pIHtcbiAgICAgICAgY29uc3QgeyBwYXJhbXMgfSA9IHByb3BzXG4gICAgICAgIGNvbnN0IHVzZXJJbmZvID0gcmVmKG51bGwpXG4gICAgICAgIFxuICAgICAgICBvbk1vdW50ZWQoYXN5bmMgKCkgPT4ge1xuICAgICAgICAgICAgdXNlckluZm8udmFsdWUgPSBhd2FpdCBQcm9taXNlLnJlc29sdmUoe1xuICAgICAgICAgICAgICBwYXJhbXMsXG4gICAgICAgICAgICAgIHVzZXJuYW1lOiBcImhlbGxvXCIsXG4gICAgICAgICAgICAgIHBob25lOiBcIjExMTExMTExMTExXCJcbiAgICAgICAgICAgIH0pXG4gICAgICAgICAgICBlbWl0KCdjaGFuZ2UnLCB1c2VySW5mby52YWx1ZSlcbiAgICAgICAgfSlcbiAgICAgICAgcmV0dXJuICgpID0+IHNsb3RzLmRlZmF1bHQ/Lih1c2VySW5mby52YWx1ZSlcbiAgICB9XG59KSIsIlVzZUNhc2UxLnZ1ZSI6Ijx0ZW1wbGF0ZT5cbiAgY2FzZTE6IDxicj5cbiAgPEZldGNoVXNlckluZm8gXG4gICAgIDpwYXJhbXM9XCJ7IHRva2VuOiAnOTUyNycgIH1cIiBcbiAgICAgQGNoYW5nZT1cImhhbmRsZVVzZXJJbmZvXCJcbiAgLz5cbiAgPHByZT5cbiAgICB7e3N0YXRlLnVzZXJJbmZvfX1cbiAgPC9wcmU+XG48L3RlbXBsYXRlPlxuPHNjcmlwdCBsYW5nPVwidHNcIj5cbmltcG9ydCB7IGRlZmluZUNvbXBvbmVudCwgcmVhY3RpdmUgfSBmcm9tIFwidnVlXCJcbmltcG9ydCBGZXRjaFVzZXJJbmZvIGZyb20gXCIuL2ZldGNoVXNlckluZm8udHNcIlxuZXhwb3J0IGRlZmF1bHQgZGVmaW5lQ29tcG9uZW50KHtcbiAgY29tcG9uZW50czogeyBGZXRjaFVzZXJJbmZvIH0sXG4gIHNldHVwICgpIHtcbiAgICBjb25zdCBzdGF0ZSA9IHJlYWN0aXZlKHtcbiAgICAgIHVzZXJJbmZvOiBudWxsXG4gICAgfSlcbiAgICBcbiAgICByZXR1cm4ge1xuICAgICAgc3RhdGUsXG4gICAgICBoYW5kbGVVc2VySW5mbyAodXNlckluZm8pIHtcbiAgICAgICAgc3RhdGUudXNlckluZm8gPSB1c2VySW5mb1xuICAgICAgfVxuICAgIH1cbiAgfVxufSlcbjwvc2NyaXB0PiIsIlVzZUNhc2UyLnZ1ZSI6Ijx0ZW1wbGF0ZT5cbiAgY2FzZTI6IDxicj5cbiAgPEZldGNoVXNlckluZm8gXG4gICAgIDpwYXJhbXM9XCJ7IHRva2VuOiAnOTUyNycgIH1cIlxuICA+XG4gICAgPHRlbXBsYXRlICNkZWZhdWx0PVwidXNlckluZm9cIj5cbiAgICAgIDxwcmU+XG4gICAgICBcdHt7IHVzZXJJbmZvIH19XG4gICAgICA8L3ByZT5cbiAgICA8L3RlbXBsYXRlPlxuICA8L0ZldGNoVXNlckluZm8+XG5cbjwvdGVtcGxhdGU+XG48c2NyaXB0IGxhbmc9XCJ0c1wiPlxuaW1wb3J0IHsgZGVmaW5lQ29tcG9uZW50IH0gZnJvbSBcInZ1ZVwiXG5pbXBvcnQgRmV0Y2hVc2VySW5mbyBmcm9tIFwiLi9mZXRjaFVzZXJJbmZvLnRzXCJcbmV4cG9ydCBkZWZhdWx0IGRlZmluZUNvbXBvbmVudCh7XG4gIGNvbXBvbmVudHM6IHsgRmV0Y2hVc2VySW5mbyB9XG59KVxuPC9zY3JpcHQ+In0=)

**封装**

```js
import { defineComponent, onMounted, ref } from "vue";

export default defineComponent({
  name: "FetchUserInfo",
  props: {
    params: Object,
  },
  emits: ["change"],
  setup(props, { emit, slots }) {
    const { params } = props;
    const userInfo = ref(null);

    onMounted(async () => {
      userInfo.value = await api(params);
      emit("change", userInfo.value);
    });
    return () => slots.default?.(userInfo.value);
  },
});
```

**使用**

1.  使用时需要缓存 userInfo

```html
<template>
  case1: <br />
  <FetchUserInfo :params="{ token: '9527'  }" @change="handleUserInfo" />
  <pre>
    {{ state.userInfo }}
  </pre>
</template>
<script lang="ts">
  import { defineComponent, reactive } from "vue";
  import FetchUserInfo from "./fetchUserInfo.ts";
  export default defineComponent({
    components: { FetchUserInfo },
    setup() {
      const state = reactive({
        userInfo: null,
      });

      return {
        state,
        handleUserInfo(userInfo) {
          state.userInfo = userInfo;
        },
      };
    },
  });
</script>
```

2.  使用时不需要缓存 userInfo

```html
<template>
  case2: <br />
  <FetchUserInfo :params="{ token: '9527'  }">
    <template #default="userInfo">
      <pre>
        {{ userInfo }}
      </pre>
    </template>
  </FetchUserInfo>
</template>
<script lang="ts">
  import { defineComponent } from "vue";
  import FetchUserInfo from "./fetchUserInfo.ts";
  export default defineComponent({
    components: { FetchUserInfo },
  });
</script>
```

### 优点

- 封装代码的感受和 minix 相当，多了组件的限制，限制了 minix 的灵活性，将每个 minix 都独立，不会相互影响，而需要相互影响的代码只会在最上层应用中体现。
- 符合组件化的设计逻辑，没有学习成本。在不提供任何用户界面的情况下，提供了复杂的逻辑，而且这些逻辑都是可以加上界面做定制化的 ui。

### 缺点

- 使用起来相对复杂一点，因为缓存数据是异步的需要额外处理(比如使用 Promise 封装 defer)来处理。
- 如果使用多个组件不缓存数据 template 的层级容易变深。

```html
<FetchUserInfo :params="{ token: '9527'  }">
  <template #default="userInfo">
    <FetchGroupInfo :params="{ groupId: userInfo.groupId  }">
      <template #default="groupInfo">
        <FetchTags :params="{ group: groupInfo.group }">
          <template #default="tags">
            {{ userInfo }} {{ groupInfo }} {{ tags }}
          </template>
        </FetchTags>
      </template>
    </FetchGroupInfo>
  </template>
</FetchUserInfo>
```

## hoc

高阶组件是 react 提出的概念。HOC 最大的特点就是：接受一个组件作为参数，返回一个新的组件。比如给组件挂载的时候做上报，点击事件做上报都特别方便。

https://zh-hans.reactjs.org/docs/higher-order-components.html。

### 使用

以 `logProps` 为例。

[sfc playground](https://sfc.vuejs.org/#eyJBcHAudnVlIjoiPHRlbXBsYXRlPlxuICA8VXNlQ2FzZTEgLz5cbjwvdGVtcGxhdGU+XG48c2NyaXB0IGxhbmc9XCJ0c1wiPlxuaW1wb3J0IHsgZGVmaW5lQ29tcG9uZW50IH0gZnJvbSBcInZ1ZVwiXG5pbXBvcnQgVXNlQ2FzZTEgZnJvbSBcIi4vVXNlQ2FzZTEudnVlXCJcbmV4cG9ydCBkZWZhdWx0IGRlZmluZUNvbXBvbmVudCh7XG4gIGNvbXBvbmVudHM6IHsgVXNlQ2FzZTEgfVxufSlcbjwvc2NyaXB0PiIsImltcG9ydC1tYXAuanNvbiI6IntcbiAgXCJpbXBvcnRzXCI6IHtcbiAgICBcInZ1ZVwiOiBcImh0dHBzOi8vc2ZjLnZ1ZWpzLm9yZy92dWUucnVudGltZS5lc20tYnJvd3Nlci5qc1wiXG4gIH1cbn0iLCJVc2VDYXNlMS52dWUiOiI8dGVtcGxhdGU+XG5cdDxDb21wIG1zZz1cImhlbGxvIHdvcmxkXCIgLz5cbjwvdGVtcGxhdGU+XG48c2NyaXB0PlxuaW1wb3J0IHsgZGVmaW5lQ29tcG9uZW50LCByZWYgfSBmcm9tIFwidnVlXCJcbmltcG9ydCBsb2dQcm9wcyBmcm9tIFwiLi9sb2dQcm9wcy50c1wiXG5pbXBvcnQgQ29tcCBmcm9tIFwiLi9Db21wLnZ1ZVwiXG5cbmV4cG9ydCBkZWZhdWx0IGRlZmluZUNvbXBvbmVudCh7XG4gIFx0Y29tcG9uZW50czoge1xuICAgICAgQ29tcDogbG9nUHJvcHMoQ29tcClcbiAgICB9XG59KVxuPC9zY3JpcHQ+IiwiQ29tcC52dWUiOiI8c2NyaXB0IHNldHVwPlxuaW1wb3J0IHsgcmVmLCBkZWZpbmVQcm9wcyB9IGZyb20gJ3Z1ZSdcbmNvbnN0IHByb3BzID0gZGVmaW5lUHJvcHMoe1xuXHRtc2c6IHtcbiAgICB0eXBlOiBTdHJpbmcsXG4gICAgZGVmYXVsdDogXCJtc2dcIlxuICB9XG59KVxuY29uc3QgbXNnID0gcmVmKHByb3BzLm1zZylcbjwvc2NyaXB0PlxuXG48dGVtcGxhdGU+XG4gIDxoMT57eyBtc2cgfX08L2gxPlxuICA8aW5wdXQgdi1tb2RlbD1cIm1zZ1wiPlxuPC90ZW1wbGF0ZT4iLCJsb2dQcm9wcy50cyI6ImltcG9ydCB7IGRlZmluZUNvbXBvbmVudCwgZ2V0Q3VycmVudEluc3RhbmNlLCBoIH0gZnJvbSBcInZ1ZVwiXG5cbmV4cG9ydCBkZWZhdWx0IGZ1bmN0aW9uIGxvZ1Byb3BzKGNvbXBvbmVudCkge1xuXG5cdHJldHVybiBkZWZpbmVDb21wb25lbnQoe1xuICAgIHNldHVwICgpIHtcbiAgICAgICAgY29uc3QgaW5zdGFuY2UgPSBnZXRDdXJyZW50SW5zdGFuY2UoKSFcblx0XHRcdFx0Y29uc3QgeyByZWYsIHByb3BzLCBjaGlsZHJlbiB9ID0gaW5zdGFuY2Uudm5vZGVcbiAgICAgIFx0Y29uc29sZS5sb2cocHJvcHMpXG4gICAgICAgIHJldHVybiAoKSA9PiB7XG4gICAgICAgICAgY29uc3Qgdm5vZGUgPSBoKGNvbXBvbmVudCwgcHJvcHMsIGNoaWxkcmVuKVxuICAgICAgICAgIC8vIGVuc3VyZSBpbm5lciBjb21wb25lbnQgaW5oZXJpdHMgdGhlIGFzeW5jIHdyYXBwZXIncyByZWYgb3duZXJcbiAgICAgICAgICB2bm9kZS5yZWYgPSByZWZcbiAgICAgICAgICByZXR1cm4gdm5vZGVcbiAgICAgICAgfVxuICAgIH1cbiAgfSlcbn0ifQ==)

**封装**

```js
import { defineComponent, getCurrentInstance, h } from "vue"

export default function logProps(component) {
  return defineComponent({
    setup () {
      const instance = getCurrentInstance()!
      const { ref, props, children } = instance.vnode
      console.log(props)
      return () => {
        const vnode = h(component, props, children)
        // ensure inner component inherits the async wrapper's ref owner
        vnode.ref = ref
        return vnode
      }
    }
  })
}
```

**使用**

```HTML
<template>
  <Comp msg="hello world" />
</template>
<script>
import { defineComponent, ref } from "vue"
import logProps from "./logProps.ts"
import Comp from "./Comp.vue"

export default defineComponent({
  components: {
    Comp: logProps(Comp)
  }
})
</script>
```

### 优点

- 支持 ES6，比 mixins 优胜。
- 复用性强，HOC 是纯函数且返回值仍为组件，在使用时可以多层嵌套，在不同情境下使用特定的 HOC 组合也方便调试。
- 同样由于 HOC 是纯函数，支持传入多个参数，增强了其适用范围。

### 缺点

- 当有多个 HOC 一同使用时，无法直接判断子组件的 props 是哪个 HOC 负责传递的。
- Vue 中的 HOC 类型很难覆盖重写。
- HOC 产生了许多无用的组件，加深了组件层级。

## IOC

将代码封装成 IOC 方法，依赖的实例通过参数传递，数据的变化通过回调执行。

### 使用

[sfc playground](https://sfc.vuejs.org/#eyJBcHAudnVlIjoiPHRlbXBsYXRlPlxuICA8VXNlQ2FzZTEgLz5cbjwvdGVtcGxhdGU+XG48c2NyaXB0IGxhbmc9XCJ0c1wiPlxuaW1wb3J0IHsgZGVmaW5lQ29tcG9uZW50IH0gZnJvbSBcInZ1ZVwiXG5pbXBvcnQgVXNlQ2FzZTEgZnJvbSBcIi4vVXNlQ2FzZTEudnVlXCJcbmV4cG9ydCBkZWZhdWx0IGRlZmluZUNvbXBvbmVudCh7XG4gIGNvbXBvbmVudHM6IHsgVXNlQ2FzZTEgfVxufSlcbjwvc2NyaXB0PiIsImltcG9ydC1tYXAuanNvbiI6IntcbiAgXCJpbXBvcnRzXCI6IHtcbiAgICBcInZ1ZVwiOiBcImh0dHBzOi8vc2ZjLnZ1ZWpzLm9yZy92dWUucnVudGltZS5lc20tYnJvd3Nlci5qc1wiXG4gIH1cbn0iLCJmZXRjaFVzZXJJbmZvLnRzIjoiZXhwb3J0IGRlZmF1bHQgZnVuY3Rpb24gdXNlckluZm9TZXJ2aWNlKGh0dHAsIGNiKSB7XG4gIFxuICByZXR1cm4ge1xuICAgIGFzeW5jIGdldChwYXJhbXMpIHtcbiAgICAgIGNvbnN0IHJlcyA9IGF3YWl0IFByb21pc2UucmVzb2x2ZSh7XG4gICAgICAgIHBhcmFtcyxcbiAgICAgICAgbmFtZTogXCJoZWxsb1wiLFxuICAgICAgICBwaG9uZTogXCIxMTExMTExMTExMTFcIlxuICAgICAgfSlcbiAgICAgIGNiKHJlcylcbiAgICB9XG4gIH1cbn0iLCJVc2VDYXNlMS52dWUiOiI8dGVtcGxhdGU+XG4gIHVzZWNhc2U6XG4gIDxwcmU+XG4gICAge3sgdXNlckluZm9TdGF0ZSB9fVxuICA8L3ByZT5cbjwvdGVtcGxhdGU+XG48c2NyaXB0PlxuaW1wb3J0IHsgZGVmaW5lQ29tcG9uZW50LCByZWYgfSBmcm9tIFwidnVlXCJcbmltcG9ydCBjcmVhdGVVc2VySW5mb1NlcnZpY2UgZnJvbSBcIi4vZmV0Y2hVc2VySW5mby50c1wiXG5cbmV4cG9ydCBkZWZhdWx0IGRlZmluZUNvbXBvbmVudCh7XG4gICAgc2V0dXAoKSB7XG4gICAgICBjb25zdCB1c2VySW5mb1N0YXRlID0gcmVmKG51bGwpXG4gICAgICBjb25zdCB1c2VySW5mb1NlcnZpY2UgPSBjcmVhdGVVc2VySW5mb1NlcnZpY2UobnVsbCwgKHVzZXJJbmZvKSA9PiB7XG4gICAgICAgIHVzZXJJbmZvU3RhdGUudmFsdWUgPSB1c2VySW5mb1xuICAgICAgfSlcbiAgICAgIFxuICAgICAgdXNlckluZm9TZXJ2aWNlLmdldCh7XG4gICAgICAgIHRva2VuOiBcIjk1MjdcIixcbiAgICAgICAgdWlkOiBcIjk1MjdcIlxuICAgICAgfSlcbiAgICAgIFxuICAgICAgcmV0dXJuIHtcbiAgICAgICAgdXNlckluZm9TdGF0ZVxuICAgICAgfVxuICAgIH1cbn0pXG48L3NjcmlwdD4ifQ==)

**封装**

```JS
export default function userInfoService(http, cb) {

  return {
    async get(params) {
      const res = await http.post('/userinfo', params)
      cb(res)
    }
  }
}
```

**使用**

```html
<template>
  usecase:
  <pre>
    {{ userInfoState }}
  </pre>
</template>
<script>
  import { defineComponent, ref } from "vue";
  import createUserInfoService from "./fetchUserInfo.ts";

  export default defineComponent({
    setup() {
      const userInfoState = ref(null);
      const userInfoService = createUserInfoService(null, (userInfo) => {
        userInfoState.value = userInfo;
      });

      userInfoService.get({
        token: "9527",
        uid: "9527",
      });

      return {
        userInfoState,
      };
    },
  });
</script>
```

### 优点

- 执行服务提供的方法来更改数据，当数据变化的时候调用参数中的回调，在回调中再触发框架的视图变化，解耦框架视图变化逻辑，纯 js 操作更新数据结构，封装出来的服务甚至可以跨框架使用。
- 降低了使用资源双方的依赖程度，资源集中管理，资源容易配置和管理。

### 缺点

- 封装难度变大，在封装过程中不能使用框架提供的方法提高开发效率。

## hooks

与框架强绑定的逻辑封装，框架帮我们把回调函数做了抽象，将变化直接更新视图，封装逻辑有点像无界面组件的缓存数据部分。

[sfc playground](https://sfc.vuejs.org/#eyJBcHAudnVlIjoiPHRlbXBsYXRlPlxuICA8VXNlQ2FzZTEgLz5cbjwvdGVtcGxhdGU+XG48c2NyaXB0IGxhbmc9XCJ0c1wiPlxuaW1wb3J0IHsgZGVmaW5lQ29tcG9uZW50IH0gZnJvbSBcInZ1ZVwiXG5pbXBvcnQgVXNlQ2FzZTEgZnJvbSBcIi4vVXNlQ2FzZTEudnVlXCJcbmV4cG9ydCBkZWZhdWx0IGRlZmluZUNvbXBvbmVudCh7XG4gIGNvbXBvbmVudHM6IHsgVXNlQ2FzZTEgfVxufSlcbjwvc2NyaXB0PiIsImltcG9ydC1tYXAuanNvbiI6IntcbiAgXCJpbXBvcnRzXCI6IHtcbiAgICBcInZ1ZVwiOiBcImh0dHBzOi8vc2ZjLnZ1ZWpzLm9yZy92dWUucnVudGltZS5lc20tYnJvd3Nlci5qc1wiXG4gIH1cbn0iLCJmZXRjaFVzZXJJbmZvLnRzIjoiaW1wb3J0IHsgcmVmIH0gZnJvbSBcInZ1ZVwiXG5cbmV4cG9ydCBkZWZhdWx0IGZ1bmN0aW9uIHVzZVVzZXJJbmZvKHBhcmFtcykge1xuXHRjb25zdCB1c2VySW5mbyA9IHJlZihudWxsKVxuICBcbiAgUHJvbWlzZS5yZXNvbHZlKHtcbiAgICBwYXJhbXMsXG4gICAgbmFtZTogXCJoZWxsb1wiLFxuICAgIHBob25lOiBcIjExMTExMTExMTExXCJcbiAgfSkudGhlbihyZXMgPT4ge1xuICAgIHVzZXJJbmZvLnZhbHVlID0gcmVzXG4gIH0pXG4gIFxuXHRyZXR1cm4ge1xuICAgIHVzZXJJbmZvXG4gIH1cbn0iLCJVc2VDYXNlMS52dWUiOiI8dGVtcGxhdGU+XG5cdHVzZWNhc2U6XG4gIDxwcmU+XG4gIFx0e3sgdXNlckluZm9TdGF0ZSB9fVxuICA8L3ByZT5cbjwvdGVtcGxhdGU+XG48c2NyaXB0PlxuaW1wb3J0IHsgZGVmaW5lQ29tcG9uZW50LCByZWYgfSBmcm9tIFwidnVlXCJcbmltcG9ydCB1c2VVc2VySW5mbyBmcm9tIFwiLi9mZXRjaFVzZXJJbmZvLnRzXCJcblxuZXhwb3J0IGRlZmF1bHQgZGVmaW5lQ29tcG9uZW50KHtcbiAgICBzZXR1cCgpIHtcbiAgICAgIGNvbnN0IHVzZXJJbmZvU3RhdGUgPSB1c2VVc2VySW5mbyh7XG4gICAgICAgICB0b2tlbjogXCI5NTI3XCIsXG4gICAgICAgICB1aWQ6IFwiOTUyN1wiXG4gICAgICB9KVxuICAgICAgXG4gICAgICByZXR1cm4ge1xuICAgICAgICB1c2VySW5mb1N0YXRlXG4gICAgICB9XG4gICAgfVxufSlcbjwvc2NyaXB0PiJ9)

### 使用

**封装**

```js
import { ref } from "vue";

export default function useUserInfo(params) {
  const userInfo = ref(null);

  api(params).then((res) => {
    userInfo.value = res;
  });

  return {
    userInfo,
  };
}
```

**使用**

```html
<template>
  usecase:
  <pre>
    {{ userInfoState }}
  </pre>
</template>
<script>
  import { defineComponent, ref } from "vue";
  import useUserInfo from "./fetchUserInfo.ts";

  export default defineComponent({
    setup() {
      const userInfoState = useUserInfo({
        token: "9527",
        uid: "9527",
      });

      return {
        userInfoState,
      };
    },
  });
</script>
```

### 优点

- 可以用框架提供的副作用方法，不需要关注数据和视图之间的桥接，让封装变简单。

### 缺点

- 封装的方法和框架强耦合，不能跨框架使用。
- 框架提供的方法都会有让视图变化的副作用，hook 之间如果依赖同一份数据，副作用会变得很难管理。
