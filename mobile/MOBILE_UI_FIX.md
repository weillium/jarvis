# Mobile UI Spacing Fix - Platform-Specific Components

## Problem

The mobile auth form had overlapping fields and text running off-screen because:

1. The shared `Input.tsx` component uses HTML `<input>` elements and
   web-specific CSS
2. React Native requires `TextInput` from Tamagui, not HTML elements
3. Spacing tokens weren't optimized for mobile touch targets

## Solution: Platform-Specific Components

### Approach

React Native's Metro bundler automatically resolves `.native.tsx` files when
importing on mobile platforms:

- **Web**: `import { Input } from '@jarvis/ui-core'` → loads `Input.tsx`
- **Mobile**: `import { Input } from '@jarvis/ui-core'` → loads
  `Input.native.tsx`

This allows us to maintain web functionality while providing mobile-optimized
implementations.

### Changes Made

#### 1. Created `Input.native.tsx`

- Uses Tamagui's native `Input` component (which wraps React Native's
  `TextInput`)
- Simplified implementation without HTML-specific features
- Increased `minHeight` to 44px for better mobile touch targets
- Supports `secureTextEntry` prop (React Native standard) instead of
  `type="password"`
- Includes password visibility toggle using Tamagui primitives

#### 2. Adjusted `FormField.tsx`

- Reduced `gap` from `$3` to `$2.5` for tighter spacing on mobile
- This change affects both web and mobile but improves mobile UX

#### 3. Updated Mobile `AuthForm`

- Reduced outer padding: `paddingVertical="$4"` (was `$6`),
  `paddingHorizontal="$5"` (was `$4`)
- Reduced font sizes: heading `$7` (was `$8`), subtitle `$3` (was `$4`)
- Reduced gaps: form fields `$4` (was `$5`), header `$6` (was `$8`)
- Added `flexWrap="wrap"` to bottom XStack to prevent text overflow
- Smaller Body text size for "sign up" link

## Benefits

✅ **Minimal Complexity**: Platform-specific files are automatically resolved by
Metro ✅ **No Breaking Changes**: Web functionality remains unchanged ✅
**Shared Where Possible**: Only Input component needed platform-specific version
✅ **Better Mobile UX**: Proper touch targets and spacing for mobile devices

## Testing

- Web: Verify auth form still works with password toggle
- Mobile: Verify no overlapping fields, proper spacing, text doesn't overflow
