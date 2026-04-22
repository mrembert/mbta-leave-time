# MBTA Commuter 🚇

A highly personalized, real-time transit companion for the Massachusetts Bay Transportation Authority (MBTA) network. Engineered to answer the one question every commuter has: **"When do I actually need to leave my front door?"**

![Vite](https://img.shields.io/badge/Vite-B73BFE?style=for-the-badge&logo=vite&logoColor=FFD62E)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white)
![Framer Motion](https://img.shields.io/badge/Framer_Motion-0055FF?style=for-the-badge&logo=framer&logoColor=white)
[![Live Demo](https://img.shields.io/badge/Live-Demo-emerald?style=for-the-badge&logo=google-cloud)](https://mbta-commuter-325194734608.us-west1.run.app)

**🔗 Live Version**: [mbta-commuter.us-west1.run.app](https://mbta-commuter-325194734608.us-west1.run.app)

## ✨ Features

- **🕒 Smart "Leave By" Calculation**: Unlike standard transit apps, MBTA Commuter aggregates your walking time, a customizable buffer, and real-time arrival predictions to give you an exact countdown to your departure.
- **📍 Intelligent Proximity**: Uses Geolocation and the Haversine formula to automatically suggest the closest station the moment you open the app.
- **🚉 Multi-Modal Support**: Seamlessly tracks Subway (Red, Orange, Blue lines), Light Rail (Green, Mattapan), and any of the hundreds of MBTA Bus routes.
- **⚡ Real-Time Sync**: Sub-minute prediction updates powered by the MBTA V3 API, ensuring you never miss a train due to delays.
- **🎨 Dynamic UI**: A clean, accessible interface that adapts its color palette to match the transit line you're tracking.
- **💾 Local Persistence**: Your preferred stations, walking speeds, and buffer preferences are saved locally for a zero-configuration experience on return visits.

## 🛠️ Tech Stack

- **Frontend**: [React 19](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/)
- **Styling**: [Tailwind CSS 4](https://tailwindcss.com/)
- **Animations**: [Framer Motion](https://www.framer.com/motion/)
- **Icons**: [Lucide React](https://lucide.dev/)
- **Data Fetching**: MBTA V3 REST API
- **Date Utility**: [date-fns](https://date-fns.org/)
- **Build Tool**: [Vite](https://vitejs.dev/)

## 🧠 How It Works: The Logic

MBTA Commuter doesn't just display a timetable; it calculates a personalized window of opportunity.

1.  **Prediction Acquisition**: Fetches the next 5 upcoming arrivals for your selected stop.
2.  **Travel Math**:
    - `LeaveBy = ArrivalTime - (UserWalkTime + UserBuffer)`
    - `Countdown = LeaveBy - CurrentTime`
3.  **Catchability Filter**: The app automatically identifies the first train that is physically possible for you to catch based on your current location and distance to the station.

## 🚀 Getting Started

### Prerequisites

- Node.js (v18+)
- npm / yarn / pnpm

### Installation

1.  **Clone the repository**
    ```bash
    git clone https://github.com/mrembert/mbta-commuter.git
    cd mbta-commuter
    ```

2.  **Install dependencies**
    ```bash
    npm install
    ```

3.  **Start the development server**
    ```bash
    npm run dev
    ```

4.  **Open the app**
    Navigate to `http://localhost:3000` in your browser.

## 🗺️ Roadmap

- [ ] **Service Alerts**: Integration of real-time MBTA service advisories directly onto station cards.
- [ ] **Multiple Stops per Line**: Support for tracking multiple directions or stops on the same route simultaneously.
- [ ] **Transit Map Integration**: An interactive map view for selecting stations visually.
- [ ] **Home Screen Widgets**: PWA support for adding the countdown as a mobile home screen widget.

## 📄 License

This project is licensed under the Apache-2.0 License - see the [LICENSE](LICENSE) file for details.

---

*Note: This application is a third-party tool and is not officially affiliated with or endorsed by the MBTA.*
