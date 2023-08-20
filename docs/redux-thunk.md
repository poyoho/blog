# redux-thunk

redux-thunk 是一个让 redux 支持异步的中间件，一句话概括就是使用`compose`阻断`dispatch`原来的行为 等到 cb 的时候再执行原来的 dispatch。

## redux middleware

先看看 redux 中间件的定义。目的是允许用户在创建 redux store 的时候，对 store 进行扩展，比如说添加日志，异步等功能。

```ts
export default function applyMiddleware(
  ...middlewares: Middleware[]
): StoreEnhancer<any> {
  return (createStore: StoreEnhancerStoreCreator) =>
    <S, A extends AnyAction>(
      reducer: Reducer<S, A>,
      preloadedState?: PreloadedState<S>
    ) => {
      const store = createStore(reducer, preloadedState)
      let dispatch: Dispatch = () => {
        throw new Error(
          'Dispatching while constructing your middleware is not allowed. ' +
            'Other middleware would not be applied to this dispatch.'
        )
      }

      const middlewareAPI: MiddlewareAPI = {
        getState: store.getState,
        dispatch: (action, ...args) => dispatch(action, ...args)
      }
      const chain = middlewares.map((middleware) => middleware(middlewareAPI))
      dispatch = compose<typeof dispatch>(...chain)(store.dispatch)

      return {
        ...store,
        dispatch
      }
    }
}
```

可以看到，redux 中间件的核心就是`compose`，`compose`的作用就是将多个函数组合成一个函数，从右到左执行。比如说`compose(f, g, h)`就是`(...args) => f(g(h(...args)))`。

```ts
export default function compose(...funcs: Function[]) {
  if (funcs.length === 0) {
    // infer the argument type so it is usable in inference down the line
    return <T>(arg: T) => arg
  }

  if (funcs.length === 1) {
    return funcs[0]
  }

  return funcs.reduce(
    (a, b) =>
      (...args: any) =>
        a(b(...args))
  )
}
```

## thunk

redux-thunk 的实现就是在`dispatch`的时候，判断`action`的类型，如果是函数就执行，如果是对象就直接`dispatch`。

因为在 middleware 中改写了 dispatch，所以当我们在 action 中调用 dispatch 的时候，实际上是调用的改写后的 dispatch，所以可以在 action 中执行异步操作。

```ts
function createThunkMiddleware<
  State = any,
  BasicAction extends Action = AnyAction,
  ExtraThunkArg = undefined
>(extraArgument?: ExtraThunkArg) {
  // Standard Redux middleware definition pattern:
  // See: https://redux.js.org/tutorials/fundamentals/part-4-store#writing-custom-middleware
  const middleware: ThunkMiddleware<State, BasicAction, ExtraThunkArg> =
    ({ dispatch, getState }) =>
    (next) =>
    (action) => {
      // The thunk middleware looks for any functions that were passed to `store.dispatch`.
      // If this "action" is really a function, call it and return the result.
      if (typeof action === 'function') {
        // Inject the store's `dispatch` and `getState` methods, as well as any "extra arg"
        return action(dispatch, getState, extraArgument)
      }

      // Otherwise, pass the action down the middleware chain as usual
      return next(action)
    }
  return middleware
}
```
