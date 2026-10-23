export const agent = {
  id: "cursor-bridge",
  name: "Cursor · Magpie Bridge",
  dir: "/Applications/Cursor.app",
  config: "~/.config/magpie-cursor-bridge/connection.json",
  format: "json",
  model: "model",
  ua: ["cursor-magpie-bridge"],
  notice: "v0.2.2：安装或更新插件后，请运行包内 setup.command 完成后台初始化。首次连接后重启 Cursor。后台桥接随连接启停；断开后还原代理。请勿同时开启 Cursor BYOK 接管。"
};
export function connect({ gateway, model, models }) {
  return {
    enabled: true,
    gateway: gateway.v1,
    key: gateway.key,
    models: models.map(m => ({id: m.id, name: m.name || m.id, context: m.context || null}))
  };
}
