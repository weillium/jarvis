export * from "./hooks/useCollapsible";
export * from "./hooks/useTabs";
export { default as tamaguiConfig } from "./tamagui.config";
export { TamaguiProvider } from "./components/TamaguiProvider";
export { SmokeTest } from "./components/SmokeTest";
export { Button } from "./components/Button";
export { Input } from "./components/Input";
export { Textarea } from "./components/Textarea";
export { Card } from "./components/Card";
export { Alert } from "./components/Alert";
export { Modal } from "./components/Modal";
export { Badge } from "./components/Badge";
export { Select } from "./components/Select";
export { Body, Caption, Heading, Label } from "./components/Typography";
export { BulletList, TagGroup } from "./components/List";
export { StatGroup, StatItem } from "./components/Stat";
export { DataTable } from "./components/DataTable";
export {
  HorizontalScrollArea,
  PageContainer,
  PageHeader,
  Toolbar,
  ToolbarSpacer,
} from "./components/Layout";
export { ProgressBar } from "./components/Progress";
export { FileUpload } from "./components/FileUpload";

// TEMPORARILY DISABLED FOR MOBILE: MarkdownEditor requires web-only dependencies (rehype-rewrite)
// TODO: Create platform-specific exports or move to web-only package
// export { MarkdownEditor } from './components/MarkdownEditor';

export { SubTabs, Tabs } from "./components/Tabs";
export { EmptyStateCard } from "./components/EmptyState";
export { FileListItem } from "./components/FileListItem";
export { Skeleton } from "./components/Skeleton";
export { LoadingState } from "./components/LoadingState";
export { ButtonGroup } from "./components/ButtonGroup";
export { FormField } from "./components/FormField";
export { ModalContent } from "./components/ModalContent";
export { ClampText } from "./components/ClampText";
export { DateTimePickerComponent as DateTimePicker } from "./components/DateTimePicker";

// Re-export commonly used Tamagui components for convenience
export {
  Anchor,
  Separator,
  Sheet,
  Spinner,
  Text,
  XStack,
  YStack,
} from "tamagui";

export * from "./icons";
