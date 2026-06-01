# 🌴 Oasis Admin Dashboard

**Clinical Nutrition Support Tool — Administrative Console**

A comprehensive, feature-rich admin dashboard for monitoring, managing, and supporting the **Oasis** clinical nutrition decision support system across registered healthcare institutions.

---

## 📋 Overview

Oasis Admin Dashboard is a web-based administrative interface designed to:

- **Monitor Live Activity**: Track real-time user presence, active sessions, and system health
- **Manage Users**: Handle role assignment, permissions, and user account administration
- **Analyze Analytics**: View comprehensive charts and KPIs on platform usage patterns
- **Moderate Content**: Review and approve clinical resources and institutional library submissions
- **Track Feedback**: Collect and analyze user feedback, bug reports, and feature requests
- **Manage System**: Push client updates, monitor error logs, and manage Firestore collections
- **Generate Reports**: Export session data and user metrics in CSV format

**Platform**: Clinical Nutrition Decision Support  
**Version**: 1.0.0 (April 2026)  
**Author**: [Edison Taimu](https://github.com/edisontaimu9-ui) · KUHeS (Kilimanjaro University of Health & Allied Sciences)

---

## ✨ Key Features

### 🏠 Home Dashboard
- **Quick Stats**: 7 key performance indicators at a glance
  - Total Sessions (all-time)
  - Now Online (real-time)
  - Calculations performed
  - Feedback submissions
  - Registered institutions
  - Total user accounts
  - New accounts (24h)
- **Quick Navigation**: Fast access to core administrative sections
- **Client Release Management**: Push version updates and release notes to all active Oasis clients

### 📊 Overview & Analytics
- **14-day Session Trends**: Visual charting of platform activity
- **Calculation Type Breakdown**: Pie/doughnut charts showing clinical calculation usage
- **Institutional Distribution**: Usage metrics by hospital/clinic
- **User Role Distribution**: Staff role analytics
- **Device Analytics**: Platform usage across device types
- **Real-time Hourly Activity**: Last 12 hours of user engagement
- **Diagnosis Breakdown**: Clinical focus area analysis

### 👥 User Management
- **Role Assignment**: Assign and modify user roles (Dietitian, Clinician, Nurse, Student, Researcher, Other)
- **User Search & Filter**: Find users by name, ID, institution, or role
- **Session Tracking**: View user activity and last login times
- **Bulk Export**: Export user data and activity reports

### 📋 Session Management
- **Browse All Sessions**: View comprehensive session records across all institutions
- **Advanced Search**: Filter by Patient ID, Ward, Institution, Calculation Type
- **Export Sessions**: Download session data as CSV for external analysis
- **Session Cleanup**: Delete obsolete or test sessions

### 💬 Feedback & Bug Tracking
- **Emoji Reactions**: Track user sentiment (👍 Helpful, ❤️ Love it, 😐 Neutral, 🐛 Bug report, 💡 Idea)
- **Reaction Summary**: Visual breakdown of user feedback types
- **Feedback Details**: View complete user messages and context
- **Export Feedback**: Download feedback data for analysis

### 📚 Library Moderation
- **Resource Management**: Review submissions from institutions
  - Approve/Reject clinical resources
  - Add moderation notes
  - Edit resource metadata
- **Category Management**: Create and manage resource categories
- **Tag Management**: Create and assign tags for better resource discovery
- **Status Tracking**: Monitor pending, approved, and rejected submissions

### ⚙️ Settings & Customization

#### 🎨 Appearance
- **5 Themes**: Dark, Light, AMOLED, High Contrast, Auto
- **8 Accent Colors**: Choose system branding accent (Teal, Amber, Blue, Purple, Green, Rose, Orange, Pink)
- **Text Options**: Intensity (Soft/Normal/Strong), Size (S/M/L/XL)
- **Compact Mode**: Toggle for space-efficient layout
- **6 Typefaces**: Barlow, Space Grotesk, Inter, DM Sans, Nunito, Syne
- **9 Background Patterns**: Grid, Dots, Lines, Circuit, Blueprint, Aurora, Midnight, Forest, Ember, Topo, Linen

#### 🔒 Security
- **Admin Password Management**: Change dashboard access password with strength indicator
- **Password Requirements**: Enforced security standards

#### 💾 System Information
- **Storage Backend**: Cloud Firestore integration
- **Status Monitoring**: Real-time database connection status
- **Collection Tracking**: Live listener and heartbeat status for:
  - Sessions
  - Users
  - Feedback
  - Calculations
  - Presence
  - Stats

### 👤 Developer Profile
- **Profile Photo**: Upload and crop profile pictures (400×400 JPEG)
- **Basic Information**: Name, Role/Title, Institution, Bio
- **Professional Links**: Email, GitHub, LinkedIn, Twitter/X
- **Profile Storage**: Firestore integration for persistent profile data

### 📡 Real-time Features
- **Live Presence Tracking**: See who's online right now with heartbeat data
- **Active User Counts**: 
  - Now Online
  - Last 30 minutes
  - Last 60 minutes
  - Last 24 hours
- **Offline Usage Tracking**: Monitor connectivity issues and offline session patterns

### 🔴 Error Logging
- **Error Level Filtering**: View Errors, Warnings, and Info messages
- **Error History**: Complete crash and runtime error log
- **Error Counts**: Badge indicators show pending error review

---

## 🏗️ Architecture

### Tech Stack
- **Frontend**: Vanilla JavaScript (no framework dependencies)
- **Backend**: Firebase / Cloud Firestore
- **Authentication**: Firebase Auth
- **Database**: Cloud Firestore (NoSQL)
- **Charts**: Chart.js 4.4.0
- **Styling**: Custom CSS with CSS variables
- **PWA**: Progressive Web App ready with service worker support

### Firebase Integration
```
Project ID: nutri-track-pro-c11c5
Services Used:
  - Firebase Authentication (compat SDK)
  - Firebase Firestore (compat SDK)
  - Firebase Storage (compat SDK)
  - Firebase Realtime Database (compat SDK)
```

### Firestore Collections
- **sessions**: User session records
- **users**: Registered user accounts and profiles
- **feedback**: User feedback and reactions
- **calculations**: Clinical calculation history
- **presence**: Real-time user presence data
- **stats**: Platform statistics and aggregated metrics

---

## 📦 Project Structure

```
Oasis-admin-dashboard-/
├── index.html                 # Main entry point & UI markup
├── styles.css                 # Complete stylesheet with theming
├── app.js                      # Core application logic
├── library_admin.js            # Library moderation system
├── orientation_manager.js      # Device orientation handling
├── manifest.json              # PWA manifest file
├── README.md                  # This file
└── [Other assets]
```

### Key Files

#### **index.html**
- Complete HTML structure for all UI panels
- Splash screen with branding
- Login/authentication screen
- Main dashboard layout with sidebar and content areas
- Modal dialogs for editing and management tasks
- PWA install prompt UI

#### **app.js**
- Authentication logic (password-based admin access)
- Firestore real-time listeners and data synchronization
- KPI calculations and dashboard metrics
- Chart.js initialization for analytics
- User interface interactions and tab switching
- Settings persistence and theming system
- Export functionality (CSV generation)
- PWA installation and update handling

#### **library_admin.js**
- Resource moderation workflow
- Category and tag management
- Pagination and filtering
- Edit modal functionality
- Status change handling

#### **styles.css**
- Complete design system with CSS variables
- Dark, Light, AMOLED, High Contrast themes
- Responsive layout for desktop and tablet
- Chart styling and animations
- Modal and overlay styling
- PWA appearance definitions

---

## 🚀 Getting Started

### Prerequisites
- Web browser with modern JavaScript support (Chrome, Firefox, Safari, Edge)
- Firebase project credentials
- Firestore database setup
- Network connectivity (or PWA cache for offline use)

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/edisontaimu9-ui/Oasis-admin-dashboard-.git
   cd Oasis-admin-dashboard-
   ```

2. **Configure Firebase**
   - Update Firebase credentials in your `app.js` if needed
   - Ensure Firestore database is initialized
   - Set up Firebase Authentication

3. **Deploy**
   - Option A: Deploy to Firebase Hosting
   - Option B: Host on any static web server
   - Option C: Access locally via `python -m http.server 8000`

4. **Access the Dashboard**
   - Navigate to the hosted URL
   - Enter admin password (default: configured in Firestore)
   - Begin managing Oasis platform

### Admin Authentication
- The dashboard uses password-based authentication
- Default admin password is stored securely in Firestore
- Change password from Settings tab after first login

---

## 🎯 Core Workflows

### Adding a User
1. Go to **Users** tab
2. Search for or browse the user list
3. Click user row to open edit modal
4. Select desired role
5. Click **Save Role**

### Approving a Resource
1. Go to **Library** → **Resources**
2. Filter by status: **Pending**
3. Click **Review** on any resource
4. Add optional moderation note
5. Click **Approve** (or **Reject**)

### Pushing a Client Update
1. Go to **Home** tab
2. Scroll to **Client Release** section
3. Enter version number (e.g., 1.2.2)
4. Write release notes
5. Click **🚀 PUSH RELEASE TO ALL CLIENTS**
6. All active Oasis clients will prompt users to update

### Exporting Session Data
1. Go to **Sessions** tab
2. Optionally filter results
3. Click **⬇ Export CSV**
4. CSV file downloads with complete session history

### Changing Admin Password
1. Go to **Settings** tab
2. Scroll to **🔒 Admin Password** section
3. Enter current password
4. Enter new password
5. Confirm new password
6. Click **SAVE PASSWORD →**

---

## 🌐 PWA Features

The dashboard is a Progressive Web App and can be installed locally:

### Installation Steps
1. Open dashboard in supported browser
2. Look for **Install** prompt (or Settings → **⬇ Install**)
3. Confirm installation
4. Access from home screen as app

### Offline Capabilities
- Cached UI and resources
- Cached data from last session
- Works offline with local data
- Syncs when connectivity restored

---

## 🎨 Customization

### Changing Colors
1. Go to **Settings** → **Appearance** → **Accent**
2. Click color swatch or **＋** for custom color
3. Selection is saved immediately

### Changing Theme
1. Go to **Settings** → **Appearance** → **Theme**
2. Select from: Dark, Light, AMOLED, High Contrast, Auto
3. Theme applies immediately

### Changing Fonts
1. Go to **Settings** → **Typeface**
2. Click desired font card
3. Font applies to entire dashboard

### Adding Background Pattern
1. Go to **Settings** → **Background**
2. Click pattern option
3. Pattern applies with current theme

---

## 📊 Data & Privacy

### Data Stored in Firestore
- User session records
- User profiles and roles
- Feedback and reactions
- Calculation history
- Real-time presence data
- Platform statistics
- Developer profile information

### Data Export
- Sessions exportable as CSV
- Feedback exportable as CSV
- Suitable for analysis in Excel/Google Sheets

### Security Considerations
- Password-protected admin access
- Firestore security rules enforce permissions
- All data transmitted over HTTPS
- No sensitive data stored in browser localStorage except theme preferences

---

## 🔧 Development & Troubleshooting

### Common Issues

**Dashboard not loading**
- Check browser console for errors (F12)
- Verify Firebase credentials are correct
- Ensure Firestore database is accessible
- Check network connectivity

**Real-time data not updating**
- Refresh the page
- Check Firestore security rules
- Verify collection names match expected structure
- Check browser's internet connection

**Charts not displaying**
- Ensure Chart.js CDN is accessible
- Check browser console for library errors
- Verify analytics data exists in Firestore

**PWA not installing**
- Ensure HTTPS is enabled (if deployed)
- Check manifest.json is valid
- Verify service worker registration

### Debug Mode
Enable console logging in `app.js` to troubleshoot data flow:
```javascript
console.log('Firestore data:', data);
```

---

## 📱 Browser Support

- **Chrome/Edge**: Full support (recommended)
- **Firefox**: Full support
- **Safari**: Full support (iOS 13+)
- **Mobile**: Optimized UI for tablets and landscape orientation

---

## 🔐 Security Notes

1. **Admin Password**: Change from default immediately after setup
2. **Firestore Rules**: Implement proper security rules to restrict access
3. **HTTPS**: Always deploy over HTTPS in production
4. **Authentication**: Consider integrating SSO for multi-admin deployments
5. **Data Backup**: Regularly export and backup critical data

---

## 📈 Performance

- **Load Time**: ~2-3 seconds (with Firebase initialization)
- **Real-time Updates**: Sub-second refresh via Firestore listeners
- **Chart Rendering**: ~500ms for 4 concurrent charts
- **Mobile Optimization**: Responsive design scales from 320px to 4K

---

## 🤝 Contributing

This is a specialized admin tool for the Oasis platform. For contributions or improvements:

1. Fork the repository
2. Create feature branch (`git checkout -b feature/amazing-feature`)
3. Make changes and test thoroughly
4. Commit with clear messages (`git commit -m 'Add amazing feature'`)
5. Push to branch (`git push origin feature/amazing-feature`)
6. Open Pull Request

---

## 📄 License

This project is provided as part of the Oasis clinical nutrition support system ecosystem.

---

## 👤 Author

**Edison Taimu**  
Clinical Nutrition Scientist  
Kilimanjaro University of Health & Allied Sciences (KUHeS)

- GitHub: [@edisontaimu9-ui](https://github.com/edisontaimu9-ui)
- Project: [Oasis Admin Dashboard](https://github.com/edisontaimu9-ui/Oasis-admin-dashboard-)
- Live Demo: https://edisontaimu9-ui.github.io/Oasis-admin-dashboard-/

---

## 📞 Support & Issues

For bugs, feature requests, or support:
- Open an issue on GitHub
- Check existing issues first to avoid duplicates
- Provide detailed error messages and steps to reproduce

---

## 🗺️ Roadmap

### Planned Features
- [ ] User bulk actions (batch role changes)
- [ ] Advanced analytics and custom date ranges
- [ ] Multi-admin support with audit logs
- [ ] SMS/Email notification system
- [ ] Automated data retention policies
- [ ] Enhanced offline sync capabilities
- [ ] Localization (Swahili, French, etc.)

---

## 📚 Related Projects

- **Oasis Main App**: Clinical nutrition decision support (Patient/Clinician interface)
- **Nutri Track Pro**: Underlying system for the Oasis platform

---

**Made with ❤️ for healthcare professionals worldwide**

Last Updated: April 2026  
Version: 1.0.0
