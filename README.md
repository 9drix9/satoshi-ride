# Satoshi Ride 🚗⚡  
**A serverless, decentralized rideshare protocol powered by Bitcoin + Nostr**

Satoshi Ride is an experimental, open-source proof-of-concept for a fully decentralized rideshare marketplace — no central servers, no platform custody, no intermediaries.

Riders broadcast ride requests.  
Drivers bid competitively.  
Payments settle in Bitcoin (Lightning + on-chain).  

No Uber. No company. Just keys.

---

## ✨ Features

- 🌐 **Serverless architecture**
  - Uses public Nostr relays for discovery & messaging
  - No backend, no database, no single point of failure

- 🔑 **Self-sovereign identity**
  - Users are just keypairs (Nostr pubkeys)
  - No accounts, emails, or passwords

- 🚕 **Competitive driver bidding**
  - Drivers compute and submit bids locally
  - Riders receive multiple offers and choose freely

- ⚡ **Bitcoin-native payments**
  - Lightning Network for instant deposits & settlement
  - On-chain escrow support planned

- 🔐 **Censorship-resistant by design**
  - Signed events
  - Open protocol
  - Permissionless participation

---

## 🧠 How it Works (High Level)

Rider → publishes ride_request (Nostr)
Driver → listens + computes bid
Driver → publishes ride_bid
Rider → receives bids
Rider → accepts one → requests Lightning invoice
Payment → ride proceeds

Everything is:
- cryptographically signed
- peer-to-peer
- globally discoverable

---

## 📦 Tech Stack

- **Node.js**
- **TypeScript**
- **nostr-tools**
- **Bitcoin Lightning Network**
- **Public Nostr relays**

No proprietary APIs. No vendor lock-in.
