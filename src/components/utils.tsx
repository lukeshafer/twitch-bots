import type { Child, PropsWithChildren } from "hono/jsx";

export function Show<T>(
  props: PropsWithChildren<{
    when: T;
  }>,
) {
  return <>{props.when ? props.children : null}</>;
}

export function For<T>(props: {
  each: Array<T>;
  child: (item: T, index: number) => Child;
}) {
  return <>{props.each.map((item, index) => props.child(item, index))}</>;
}
