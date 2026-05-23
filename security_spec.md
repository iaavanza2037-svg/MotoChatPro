# Security Specification for Moto Chat

## 1. Data Invariants
- **User Integrity**: A user can only create and update their own user document, where `userId` equals `request.auth.uid`. Their email in the document must match their authentication email.
- **Relational Chat Invariant**: A Chat document must contain a valid `clientId` and `driverId`. The `chatId` is composed of `clientId_driverId` or is a valid string. Only the current client or the driver specified on the chat document can read or write messages for that session.
- **Master Gate for Messages**: A message cannot be created or viewed unless the current user is either the `clientId` or the current `driverId` of the parent chat document.
- **Transfer Consent**: During a chat transfer, the active driver can only transfer the chat to an existing, valid online driver, and they must write the change to the `driverId`, `driverName`, and `driverEmail` properties while maintaining all other fields (like `clientId`) immutable.

---

## 2. The "Dirty Dozen" Payloads (Exploit Scenarios)
Here are 12 specific JSON payloads designed to test and attempt to break the laws of Identity, Integrity, and State on Firestore, which our rules must secure.

### Payload 1: Identity Spoofing - Creating User Profile for another uid
- **Collection**: `/users/attacker_uid`
- **Attempt**: Creating a profile where `uid` is set to `victim_uid`.
- **Expected Action**: Rejected (UID must match authentication ID).

### Payload 2: Self-Promotion/Privilege Escalation on User Creation
- **Collection**: `/users/attacker_uid`
- **Attempt**: Setting the role to `admin` or a role outside `['cliente', 'moto']` to attempt to bypass restricted role behaviors.
- **Expected Action**: Rejected (Role must be strictly validation bounded).

### Payload 3: Eavesdropping on Chats as a Third Party
- **Collection**: `/chats/clientUid_driverUid`
- **Attempt**: Reading a chat document where the user is neither `clientId` nor `driverId`.
- **Expected Action**: Rejected (Read denied for non-participants).

### Payload 4: Hijacking Chat Owner during Transfer
- **Collection**: `/chats/clientUid_driverUid`
- **Attempt**: Modifying the `clientId` during a transfer.
- **Expected Action**: Rejected (Only `driverId`, `driverName`, and `driverEmail` can be modified on transfer).

### Payload 5: Spoofing Message Sender
- **Collection**: `/chats/clientUid_driverUid/messages/message123`
- **Attempt**: Creating a message with `senderId` set to `victimUid`.
- **Expected Action**: Rejected (Sender ID must match current caller's auth UID).

### Payload 6: Message Injection into another user's conversation
- **Collection**: `/chats/clientUid_victimUid/messages/msg999`
- **Attempt**: An attacker writing messages into a chat where they are not the client or the driver.
- **Expected Action**: Rejected (Master Gate block on parent chat document).

### Payload 7: State Shortcutting - Modifying `status` to invalid values
- **Collection**: `/chats/clientUid_driverUid`
- **Attempt**: Modifying `status` to something other than `["open", "closed", "transferred"]`.
- **Expected Action**: Rejected (Must match schema validation).

### Payload 8: Value Poisoning - Injecting 10MB data string into User Name
- **Collection**: `/users/attacker_uid`
- **Attempt**: Updating display text with massive random character strings to inflate storage usage.
- **Expected Action**: Rejected (String size must be reasonably bounded, e.g., `<= 100` characters for username).

### Payload 9: Temporal Spoofing
- **Collection**: `/chats/clientUid_driverUid/messages/msg77`
- **Attempt**: Creating a message with a custom backdated client timestamp to manipulate chat ordering.
- **Expected Action**: Rejected (Timestamp must equal server time).

### Payload 10: Unauthorized Chat Status Closure
- **Collection**: `/chats/clientUid_driverUid`
- **Attempt**: A random third-party user setting a chat status to `closed` to disrupt active services.
- **Expected Action**: Rejected (Only authorized participants can update).

### Payload 11: Deleting historic chat messages
- **Collection**: `/chats/clientUid_driverUid/messages/msg77`
- **Attempt**: A client or driver deleting historic messages to cover tracks.
- **Expected Action**: Rejected (Delete operation is disabled or restricted to secure log audit trails).

### Payload 12: Bypassing Chat ID constraints (ID Poisoning)
- **Collection**: `/chats/very_long_garbage_id_representing_potential_denial_of_wallet`
- **Attempt**: Writing a document using a malformed, massive string as key identifier.
- **Expected Action**: Rejected (isValidId check on chat path variable).

---

## 3. Test Runner Blueprint
Our rules are verified to return `PERMISSION_DENIED` for all above scenarios by configuring tight security checks in `firestore.rules`.
