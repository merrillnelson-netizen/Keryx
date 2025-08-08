# Voice Logger Pro - Replit Configuration

## Overview

Voice Logger Pro is a voice-activated logging and query system that allows users to log structured data and query it using natural language voice commands. The application uses speech recognition to capture voice input, processes it through custom parsers, and stores structured data in a PostgreSQL database. Users can create custom templates to define data structures and query formats, making it adaptable for various logging scenarios like billiards leagues, project tracking, or any structured data collection.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript using Vite as the build tool
- **UI Framework**: Tailwind CSS with shadcn/ui component library for Material Design-inspired interface
- **Routing**: Wouter for lightweight client-side routing
- **State Management**: TanStack Query (React Query) for server state management and caching
- **Speech APIs**: Browser's native Web Speech API for both recognition (SpeechRecognition) and synthesis (SpeechSynthesis)

### Backend Architecture
- **Runtime**: Node.js with Express.js framework
- **Language**: TypeScript with ES modules
- **API Design**: RESTful endpoints following conventional patterns
- **Database ORM**: Drizzle ORM for type-safe database operations
- **Session Management**: Express sessions with PostgreSQL store via connect-pg-simple

### Database Design
- **Database**: PostgreSQL with Neon serverless deployment
- **Schema**: Four main entities:
  - `users`: User authentication and management
  - `templates`: Define logging formats and field structures
  - `log_entries`: Store parsed voice command data with JSON fields
  - `settings`: Application configuration and user preferences
- **Data Storage**: JSONB fields for flexible schema-less data within structured tables

### Voice Processing Pipeline
- **Speech Recognition**: Browser's SpeechRecognition API with configurable confidence thresholds
- **Command Parsing**: Custom parser in `voice-parser.ts` that extracts structured data from natural language
- **Template System**: Flexible templates define expected data structures and parsing rules
- **Response Generation**: Text-to-speech feedback using SpeechSynthesis API

### Application Structure
- **Monorepo Layout**: Shared schema between client and server in `/shared` directory
- **Component Architecture**: Modular React components with custom hooks for speech functionality
- **Type Safety**: Full TypeScript coverage with Zod for runtime validation
- **Development Tools**: Vite dev server with hot reload and error overlay

### Key Features
- **Multi-mode Operation**: Separate logging and querying modes with different processing logic
- **Template Management**: Users can create, activate, and manage custom data templates
- **Real-time Feedback**: Live transcript display and voice response confirmation
- **Data History**: Complete log history with structured data display
- **Responsive Design**: Mobile-friendly interface with consistent Material Design patterns

## External Dependencies

### Core Technologies
- **Database**: Neon PostgreSQL serverless database
- **ORM**: Drizzle ORM with PostgreSQL dialect for database operations
- **UI Components**: Radix UI primitives via shadcn/ui for accessible component foundation
- **Styling**: Tailwind CSS for utility-first styling approach

### Development Tools
- **Build System**: Vite for fast development and optimized production builds
- **Type Checking**: TypeScript compiler with strict mode enabled
- **Validation**: Zod for schema validation and type inference
- **Session Store**: connect-pg-simple for PostgreSQL-backed Express sessions

### Browser APIs
- **Speech Recognition**: Web Speech API (webkit/standard) for voice input processing
- **Speech Synthesis**: Web Speech Synthesis API for audio feedback
- **Media**: Microphone access through getUserMedia for voice input

### Hosting Platform
- **Platform**: Replit with specialized Vite plugin for development environment
- **Environment**: Node.js runtime with automatic database provisioning
- **Development**: Hot reload and error overlay for enhanced development experience