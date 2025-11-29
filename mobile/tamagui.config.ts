import config from '../packages/ui-core/src/tamagui.config'

export { config }
export default config
export type Conf = typeof config

declare module 'tamagui' {
  // Augment tamagui types to use the shared config
  interface TamaguiCustomConfig extends Conf {}
}
