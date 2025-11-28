// Re-export the shared Tamagui config from ui-core
// The babel plugin needs a local config file, so we import and re-export from ui-core
import { tamaguiConfig } from '@jarvis/ui-core';
export default tamaguiConfig;

