# Online Exam Platform

A monorepo-style scaffold for building an online examination system. It includes a Node.js + Express backend, a static frontend placeholder, and shared documentation to help you get started quickly.

## Project Layout

```
exam-platform/
├── backend/              # Express API + MongoDB layer
│   ├── src/
│   │   ├── config/       # App + database configuration helpers
│   │   ├── controllers/  # Route handlers and business logic
│   │   ├── middleware/   # Authentication & error handling
│   │   ├── models/       # Mongoose schemas
│   │   ├── routes/       # API endpoint definitions
│   │   └── utils/        # Reusable utilities (tokens, validators, seeding)
│   ├── package.json
│   └── .env.example
├── frontend/
│   ├── views/            # Server-rendered EJS templates
│   └── public/           # Static assets (CSS, JS, images)
├── README.md
└── .gitignore
```

## Backend Setup

1. Copy the example environment file:

```powershell
cd backend
copy .env.example .env
```

2. Update `.env` with your MongoDB connection string, JWT secret, and the default admin preferences.

3. Install dependencies and start the server:

```powershell
npm install
npm run dev
```

The server boots on the configured `PORT` (default `5000`), connects to MongoDB, and provisions a default admin account if it does not already exist. Visit `http://localhost:5000/health` for a quick status check.

## Default Admin Bootstrap

- Controlled through the backend `.env` file (`DEFAULT_ADMIN_*` variables).
- If no secure password is provided, a temporary one is generated and printed to the console.
- Set `DEFAULT_ADMIN_FORCE_RESET=true` to rotate the admin password on the next restart.

## Frontend Rendering

- `frontend/views` contains EJS templates rendered by Express for the home, login, and registration screens.
- `frontend/public` exposes shared styles and client-side scripts.
- Update or add templates in `frontend/views` as the UI grows (partials live in `frontend/views/partials`).

### Role-based dashboard

- `/dashboard` loads a dynamic view backed by `frontend/views/dashboard.ejs` and `frontend/public/js/dashboard.js`.
- Admins can create organizations, register/deactivate teacher accounts, and assign teachers to organizations.
- Admins and instructors share access to the exam creation workflow and can review the exams they own.
- Students see a streamlined experience focused on upcoming exams and test entry points.

### New API highlights

- `POST /api/organizations` (admin) — create organizations; `DELETE /api/organizations/:id` removes them.
- `POST /api/organizations/:id/teachers/:teacherId` / `DELETE ...` — assign or remove instructors from an organization.
- `POST /api/admin/teachers` (admin) — provision instructor accounts; `DELETE /api/admin/teachers/:id` deactivates them.
- `GET /api/exams/upcoming` — returns exams that are scheduled to start soon or are still active for student dashboards.

## Next Steps

- Flesh out the controllers with production-grade validation and business rules.
- Replace the static frontend with React, Vue, or another framework when ready.
- Add automated tests (`Jest`, `Vitest`, etc.) and CI workflows to keep quality high.
