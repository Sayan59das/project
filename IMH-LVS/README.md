# IMH Label Verification System (LVS)

This repository contains the full-stack Label Verification System designed for healthcare and pharmaceutical products. The system uses AI and OCR to compare artwork files (labels, PDFs, images) against reference sources, extracting parameter-level differences for Quality Assurance (QA) and Management approvals.

---

## 🛠️ Tasks Completed

### 1. AI Vision & Text Validation Service (Python)
- **Built the `ai_backend`**: Set up a FastAPI microservice in Python to handle the heavy AI lifting.
- **Gemini Integration**: Connected to `google-genai` (Gemini 2.5) to perform intelligent extraction of label data (Product Name, Brand, FSSAI Number, etc.).
- **Smart Comparison Logic**: Built robust prompts to compare a Candidate Label against a Reference Label and output a structured JSON discrepancy report.

### 2. Backend Foundation & OCR (Node.js/Express)
- **Built the `backend`**: Scaffolded an Express.js server to act as the primary API gateway.
- **OCR Implementation**: Integrated `tesseract.js`, `pdfjs-dist`, and `sharp` to support rasterizing PDFs and extracting raw text from images.
- **REST APIs**: Created dedicated API routes (`/api/data/*`) to handle CRUD operations for Master Data, Products, Artworks, and Comparisons.

### 3. Database Migration (Prisma + PostgreSQL)
- **Schema Design**: Defined the Prisma ORM schema (`schema.prisma`) mapping out `User`, `Product`, `Artwork`, `Comparison`, and `Brand` relationships.
- **Replaced LocalStorage**: Completely migrated the application away from volatile, frontend-only `localStorage` into a highly structured SQL format.
- **Automated Migrations**: Configured the backend Docker container to execute `npx prisma db push` automatically at startup to sync the schema.

### 4. Frontend Asynchronous Refactoring (React + Vite)
- **Async Data Hooks**: Created the centralized `useMasterData` hook to pull real data from the Express backend via Axios.
- **Page Refactoring**: Refactored major UI components (`ReportsPage`, `ApprovalsPage`, `ArtworkPage`, `QAPage`, and `SelectLabelCard`) to handle `Promise`-based async data loading instead of immediate synchronous returns.
- **TypeScript Fixes**: Systematically resolved all `tsc` compilation and typing errors caused by the transition to asynchronous data sources.

### 5. Deployment Orchestration (Render)
- **Render Blueprint**: Wrote a `render.yaml` configuration file to easily spin up the entire application stack.
- **PostgreSQL Provisioning**: Included instructions in the Blueprint to automatically spin up a free `imh-lvs-db` PostgreSQL instance.
- **Dockerized Backend**: Wrote a multi-stage `Dockerfile` ensuring heavy system dependencies like `poppler-utils` are installed for the backend to process PDFs seamlessly in the cloud.

---

## 🚀 Tasks Left to Complete

While the core functionality and cloud deployment architecture are finished, the following items remain before the system is fully production-ready:

### 1. Cloud Storage Integration (AWS S3 / GCP Cloud Storage)
- **Current State**: The Node.js backend saves uploaded Artwork PDFs and Images to a local `/app/uploads` folder.
- **The Problem**: Render Docker environments are ephemeral. Whenever the backend server restarts or deploys, local files are wiped out.
- **Next Step**: Update the Multer configuration in the Node.js backend to upload files directly to an AWS S3 bucket (or Google Cloud Storage) and save the resulting public URL strings into the PostgreSQL database.

### 2. Real Authentication & Authorization
- **Current State**: The frontend utilizes a mock `useAuth` hook, allowing users to switch roles instantly without logging in.
- **The Problem**: There is no real security guarding the APIs or the Application.
- **Next Step**: Integrate a secure Auth provider like **Clerk**, **Auth0**, or Firebase Auth. We need to validate authentication JWT tokens on the Express backend before allowing data writes.

### 3. Execution of the Render Deployment
- **Current State**: The `render.yaml` is fully configured. 
- **Next Step**: Push this entire repository to a remote GitHub repository, connect your Render dashboard to GitHub, and deploy via the **New Blueprint Instance** flow.

### 4. AI In-Context Learning for Edge-Case Layouts
- **Current State**: We discussed using **Option A** (passing few-shot examples inside the AI Prompt) to increase the AI's accuracy for 3 highly specific label layouts without doing complex LoRA fine-tuning.
- **Next Step**: Collect the "perfect" JSON examples for those 3 layouts and explicitly embed them as templates in the `ai_backend` prompt configuration to ensure flawless accuracy on your production datasets.
