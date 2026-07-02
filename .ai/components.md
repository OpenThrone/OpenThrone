# OpenThrone Component Map

> Auto-generated codemap. Review and update when components are added/removed.

---

## Layout & Navigation

| Component | File | Description |
|---|---|---|
| `Layout` | `src/components/Layout.tsx` | Main layout wrapper with race-based theming |
| `MainArea` | `src/components/MainArea.tsx` | Main content area container |
| `Sidebar` | `src/components/Sidebar.tsx` | Desktop sidebar navigation |
| `MobileNavigation` | `src/components/MobileNavigation.tsx` | Mobile bottom navigation bar |
| `MobileSidebarContent` | `src/components/MobileSidebarContent.tsx` | Mobile sidebar slide-out content |
| `navLoggedIn` | `src/components/navLoggedIn.tsx` | Navigation for authenticated users |
| `navLoggedOut` | `src/components/navLoggedOut.tsx` | Navigation for guest users |
| `HeaderIconButton` | `src/components/HeaderIconButton.tsx` | Header icon button primitive |
| `LanguageSwitcher` | `src/components/LanguageSwitcher.tsx` | i18n language toggle |
| `Meta` | `src/layouts/Meta.tsx` | SEO/head meta tags |
| `NavSkeleton` | `src/components/NavSkeleton.tsx` | Loading skeleton for nav |
| `SidebarSkeleton` | `src/components/SidebarSkeleton.tsx` | Loading skeleton for sidebar |
| `MainAreaSkeleton` | `src/components/MainAreaSkeleton.tsx` | Loading skeleton for main area |

## Cards & Panels

| Component | File | Description |
|---|---|---|
| `themedCard` | `src/components/themedCard.tsx` | Race-themed card wrapper |
| `StatCard` | `src/components/StatCard.tsx` | Single stat display card |
| `ContentCard` | `src/components/ContentCard.tsx` | Generic content card |
| `OrnatePanel` | `src/components/OrnatePanel.tsx` | Decorative RPG panel |
| `levelCard` | `src/components/levelCard.tsx` | Level display card |
| `HeroBanner` | `src/components/HeroBanner.tsx` | Hero/banner section |
| `PaperTable` | `src/components/PaperTable.tsx` | Mantine Paper-based table |

## Data Display

| Component | File | Description |
|---|---|---|
| `NumericTable` | `src/components/NumericTable.tsx` | Numeric data table |
| `statsTable` | `src/components/statsTable.tsx` | Stats display table |
| `StatsList` | `src/components/StatsList.tsx` | Stats list display |
| `DiscountSummary` | `src/components/DiscountSummary.tsx` | Discount summary display |
| `TabbedContent` | `src/components/TabbedContent.tsx` | Tabbed content container |
| `UserList` | `src/components/UserList.tsx` | User list display |
| `UserSearchFilter` | `src/components/UserSearchFilter.tsx` | User search/filter controls |
| `FramedAvatar` | `src/components/FramedAvatar.tsx` | Avatar with decorative frame |
| `RpgAwesomeIcon` | `src/components/RpgAwesomeIcon.tsx` | RPG Awesome icon wrapper |
| `SocialIcon` | `src/components/SocialIcon.tsx` | Social platform icon |
| `ImagWithFallback` | `src/components/ImagWithFallback.tsx` | Image with fallback support |

## Battle & Combat

| Component | File | Description |
|---|---|---|
| `attackResult` | `src/components/attackResult.tsx` | Attack result display |
| `BattleResultBanner` | `src/components/BattleResultBanner.tsx` | Win/loss result banner |
| `BattleStatStrip` | `src/components/BattleStatStrip.tsx` | Battle stats strip |
| `BattleLedger` | `src/components/BattleLedger.tsx` | Battle ledger/summary |
| `BattleTestResults` | `src/components/BattleTestResults.tsx` | Battle test result display |
| `PlayerOutcome` | `src/components/PlayerOutcome.tsx` | Player outcome indicator |
| `LossesList` | `src/components/LossesList.tsx` | Losses display list |
| `AttackLog` | `src/components/AttackLog.tsx` | Attack log display |
| `AttackLogShareModal` | `src/components/AttackLogShareModal.tsx` | Share attack log modal |
| `ArmyInputForm` | `src/components/ArmyInputForm.tsx` | Army composition form |
| `ArmyPresets` | `src/components/ArmyPresets.tsx` | Army preset selector |
| `ItemsInputForm` | `src/components/ItemsInputForm.tsx` | Items selection form |
| `PresetNumberInput` | `src/components/PresetNumberInput.tsx` | Number input with presets |
| `spyMissionsModal` | `src/components/spyMissionsModal.tsx` | Spy mission selection |
| `IntelResult` | `src/components/IntelResult.tsx` | Intel gather result |
| `AssassinateResult` | `src/components/AssassinateResult.tsx` | Assassination result |
| `InfiltrationResult` | `src/components/InfiltrationResult.tsx` | Infiltration result |

## Upgrades

| Component | File | Description |
|---|---|---|
| `battle-upgrade` | `src/components/battle-upgrade.tsx` | Battle upgrade section |
| `fortification-upgrades` | `src/components/fortification-upgrades.tsx` | Fortification upgrades |
| `armory-upgrades` | `src/components/armory-upgrades.tsx` | Armory upgrades |
| `clandestineupgrades` | `src/components/clandestineupgrades.tsx` | Clandestine upgrades |
| `housing-upgrades` | `src/components/housing-upgrades.tsx` | Housing upgrades |
| `offenseupgrade` | `src/components/offenseupgrade.tsx` | Offense upgrade |

## Units & Items

| Component | File | Description |
|---|---|---|
| `unitsection` | `src/components/unitsection.tsx` | Unit section (legacy) |
| `newUnitSection` | `src/components/newUnitSection.tsx` | Unit section (new) |
| `itemsection` | `src/components/itemsection.tsx` | Item section (legacy) |
| `newItemSection` | `src/components/newItemSection.tsx` | Item section (new) |

## Banking & Economy

| Component | File | Description |
|---|---|---|
| `BankDepositWithdraw` | `src/components/BankDepositWithdraw.tsx` | Deposit/withdraw form |
| `GoldTransferModal` | `src/components/GoldTransferModal.tsx` | Gold transfer modal |
| `GoldRequestNotificationModal` | `src/components/GoldRequestNotificationModal.tsx` | Gold request notification |
| `BankHistoryFilters` | `src/components/BankHistoryFilters.tsx` | Bank history filter controls |
| `BankHistoryTable` | `src/components/BankHistoryTable.tsx` | Bank history data table |

## Messaging & Chat

| Component | File | Description |
|---|---|---|
| `ChatMessageList` | `src/components/ChatMessageList.tsx` | Chat message list |
| `ChatMessageGroup` | `src/components/ChatMessageGroup.tsx` | Chat message group |
| `ChatRoomList` | `src/components/ChatRoomList.tsx` | Chat room list |
| `MessageInput` | `src/components/MessageInput.tsx` | Message input field |
| `composemodal` | `src/components/composemodal.tsx` | Compose message modal |
| `compose-form` | `src/components/compose-form.tsx` | Compose message form |
| `NewMessageModal` | `src/components/NewMessageModal.tsx` | New message modal |

## News & Announcements

| Component | File | Description |
|---|---|---|
| `AnnouncementBanner` | `src/components/AnnouncementBanner.tsx` | Announcement banner |
| `newsAccordion` | `src/components/newsAccordion.tsx` | News accordion |
| `news-bulletin` | `src/components/news-bulletin.tsx` | News bulletin display |

## Modals & Overlays

| Component | File | Description |
|---|---|---|
| `modal` | `src/components/modal.tsx` | Generic modal (legacy) |
| `ConfirmationModal` | `src/components/ConfirmationModal.tsx` | Confirmation dialog |
| `SessionModal` | `src/components/SessionModal.tsx` | Session modal |
| `VacationModeModal` | `src/components/VacationModeModal.tsx` | Vacation mode toggle |

## Forms & Inputs

| Component | File | Description |
|---|---|---|
| `form` | `src/components/form.tsx` | Generic form wrapper |
| `alert` | `src/components/alert.tsx` | Alert/notification |
| `AnimatedButton` | `src/components/AnimatedButton.tsx` | Animated button |
| `loading-dots` | `src/components/loading-dots.tsx` | Loading dots animation |
| `SnackbarBridge` | `src/components/SnackbarBridge.tsx` | Snackbar notification bridge |

## Social

| Component | File | Description |
|---|---|---|
| `friendCard` | `src/components/friendCard.tsx` | Friend display card |

## User Management

| Component | File | Description |
|---|---|---|
| `UserAdminEditor` | `src/components/UserAdminEditor.tsx` | User admin edit form |
| `UserAdminTable` | `src/components/UserAdminTable.tsx` | User admin table |
| `GrantUserForm` | `src/components/GrantUserForm.tsx` | Grant permissions form |
| `PermissionCheck` | `src/components/PermissionCheck.tsx` | Permission check wrapper |

## Alliance Components

| Component | File | Description |
|---|---|---|
| `AllianceOverview` | `src/components/alliance/AllianceOverview.tsx` | Alliance overview |
| `AllianceMembers` | `src/components/alliance/AllianceMembers.tsx` | Alliance members list |
| `AllianceSettings` | `src/components/alliance/AllianceSettings.tsx` | Alliance settings |
| `AllianceBank` | `src/components/alliance/AllianceBank.tsx` | Alliance bank |
| `AllianceWar` | `src/components/alliance/AllianceWar.tsx` | Alliance war view |
| `DeclareWarModal` | `src/components/alliance/DeclareWarModal.tsx` | Declare war modal |

## Admin Components

| Component | File | Description |
|---|---|---|
| `AdminLayout` | `src/components/admin/AdminLayout.tsx` | Admin section layout |
| `AdminSidebar` | `src/components/admin/AdminSidebar.tsx` | Admin sidebar navigation |
| `adminNavConfig` | `src/components/admin/adminNavConfig.ts` | Admin navigation config |

## Game (Themed) Components

| Component | File | Description |
|---|---|---|
| `StyledNews` | `src/components/game/StyledNews.tsx` | Themed news display |
| `StyledLosses` | `src/components/game/StyledLosses.tsx` | Themed losses display |
| `StyledTable` | `src/components/game/StyledTable.tsx` | Themed data table |
| `StyledContent` | `src/components/game/StyledContent.tsx` | Themed content wrapper |
| `SidebarTablet` | `src/components/game/SidebarTablet.tsx` | Tablet sidebar |
| `SidebarScroll` | `src/components/game/SidebarScroll.tsx` | Scrollable sidebar |
| `UnitTrainingPanel` | `src/components/game/UnitTrainingPanel.tsx` | Unit training interface |
| `StatGrid` | `src/components/game/StatGrid.tsx` | Stats grid display |
| `WarlordTable` | `src/components/game/WarlordTable.tsx` | Warlord ranking table |
| `WarRoomLog` | `src/components/game/WarRoomLog.tsx` | War room log |
| `GameCard` | `src/components/game/GameCard.tsx` | Game card primitive |
| `GameTableDemo` | `src/components/game/GameTableDemo.tsx` | Game table demo |
| `ChatMessageGroupThemed` | `src/components/game/ChatMessageGroupThemed.tsx` | Themed chat group |
| `ChatMessageListThemed` | `src/components/game/ChatMessageListThemed.tsx` | Themed chat list |
| `ChatMessageInputThemed` | `src/components/game/ChatMessageInputThemed.tsx` | Themed chat input |
| `ChatRoomListThemed` | `src/components/game/ChatRoomListThemed.tsx` | Themed chat rooms |

## Tests

| File | Description |
|---|---|
| `src/components/MobileNavigation.test.tsx` | MobileNavigation tests |

---

## Component Naming Patterns

- **PascalCase**: Newer components (`StatCard`, `ConfirmationModal`, `BattleResultBanner`)
- **camelCase**: Legacy components (`attackResult`, `spyMissionsModal`, `newsAccordion`)
- **kebab-case**: Legacy components (`battle-upgrade`, `news-bulletin`, `loading-dots`)

New components should use **PascalCase** to match the modern convention.
