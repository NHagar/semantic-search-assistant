# Semantic Search Assistant Frontend

A modern, interactive web interface for the Semantic Search Assistant, built with Svelte and Vite. This frontend provides a complete workflow for document research and analysis, from upload to final report generation.

## Features

### 📋 Step-by-Step Workflow
- **Upload Documents**: Drag-and-drop PDF upload with progress tracking
- **Document Processing**: Configure text extraction and sampling parameters
- **Document Description**: Generate and edit corpus descriptions using AI
- **Search Plans**: Create and customize AI-generated search strategies
- **Search Execution**: Monitor real-time tool calls and agent progress
- **Report Review**: View and edit generated research reports
- **Final Synthesis**: Generate comprehensive final reports

### 🛠 Key Capabilities
- **Real-time API Communication**: Live updates from Python backend
- **Interactive Tool Call Visualization**: See exactly how AI agents search
- **Editable Content**: Modify descriptions, plans, and reports at any stage
- **Progress Tracking**: Visual step indicator with completion states
- **Error Handling**: Comprehensive error display and recovery
- **Responsive Design**: Works on desktop and mobile devices

## Architecture

### Frontend Stack
- **Svelte 4**: Reactive UI framework
- **Vite**: Fast build tool and development server
- **Axios**: HTTP client for API communication
- **Vanilla CSS**: Custom styling with CSS Grid and Flexbox

### Backend Integration
- **Flask API**: RESTful endpoints for all operations
- **CORS Enabled**: Cross-origin requests supported
- **File Upload**: Multipart form data handling
- **Real-time Processing**: Long-running operation support

## Quick Start

### Prerequisites
- Node.js 16+ and npm
- Python 3.8+ with required packages
- Running Semantic Search Assistant backend

### 1. Backend Setup
First, ensure the Python backend is running:

```bash
# In the main project directory
pip install flask flask-cors
python app.py
```

The backend will start on `http://localhost:5001`

### 2. Frontend Setup
```bash
# Navigate to frontend directory
cd frontend

# Install dependencies
npm install

# Start development server
npm run dev
```

The frontend will be available at `http://localhost:5173`

### 3. Usage Flow
1. **Start**: Upload PDF documents using drag-and-drop
2. **Process**: Configure and run document processing
3. **Describe**: Generate an AI description of your document corpus
4. **Plan**: Enter your research question and generate search plans
5. **Execute**: Run the search agents and monitor tool calls
6. **Review**: Edit the generated reports as needed
7. **Synthesize**: Create your final comprehensive report

## API Endpoints

The frontend communicates with these backend endpoints:

### Health & Status
- `GET /api/health` - Check API connectivity

### Document Management
- `POST /api/upload` - Upload PDF files
- `POST /api/process-documents` - Extract and sample text
- `GET /api/get-description` - Get document description
- `POST /api/compress-documents` - Generate description
- `POST /api/update-description` - Update description

### Search Planning
- `POST /api/generate-search-plans` - Generate search plans
- `GET /api/get-search-plans` - Get existing plans
- `POST /api/update-search-plan` - Update a plan

### Search Execution
- `POST /api/execute-search-plans` - Run search agents
- `GET /api/get-reports` - Get generated reports
- `POST /api/update-report` - Update a report

### Final Synthesis
- `POST /api/synthesize-final-report` - Generate final report
- `GET /api/get-final-report` - Get final report
- `POST /api/update-final-report` - Update final report

## Component Structure

```
src/
├── lib/
│   ├── api.js                 # API service layer
│   ├── stores.js             # Svelte stores for state management
│   ├── FileUpload.svelte     # Drag-and-drop file upload
│   ├── DocumentProcessor.svelte # Document processing controls
│   ├── DocumentDescription.svelte # AI description generation
│   ├── SearchPlans.svelte    # Search plan management
│   ├── SearchExecution.svelte # Agent execution monitoring
│   ├── ReportsViewer.svelte  # Report viewing and editing
│   └── FinalReport.svelte    # Final report generation
├── App.svelte                # Main application component
└── main.js                  # Application entry point
```

## State Management

The application uses Svelte stores for global state:

- `currentStep`: Current workflow step (0-5)
- `userQuery`: Research question
- `loading`: Global loading state
- `error`: Error messages
- `uploadedFiles`: Uploaded file list
- `documentDescription`: Corpus description
- `searchPlans`: Generated search plans
- `reports`: Generated reports
- `finalReport`: Final synthesized report

## Tool Call Visualization

The search execution step provides detailed visualization of AI agent tool calls:

- **Real-time Updates**: See tool calls as they happen
- **Function Details**: View function names and arguments
- **Results Display**: Formatted JSON responses
- **Debug Logs**: Complete execution traces
- **Performance Metrics**: Timing and iteration counts

## Customization

### Styling
The application uses vanilla CSS with CSS custom properties for theming. Key color variables:

```css
:root {
  --primary-color: #2196f3;
  --success-color: #4caf50;
  --warning-color: #ff9800;
  --error-color: #f44336;
  --background-color: #f5f7fa;
}
```

### API Configuration
Update the API base URL in `src/lib/api.js`:

```javascript
const API_BASE_URL = 'http://localhost:5000/api';
```

## Development

### Available Scripts
- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run preview` - Preview production build

### Hot Reload
The development server supports hot module replacement. Changes to Svelte components and JavaScript files will be reflected immediately.

### Deployment
Build the application for production:

```bash
npm run build
```

The built files will be in the `dist/` directory, ready for deployment to any static hosting service.

## Troubleshooting

### Common Issues

**API Connection Failed**
- Ensure Python backend is running on port 5000
- Check CORS configuration in `app.py`
- Review browser console for network errors

**File Upload Not Working**
- Verify file size limits in Flask configuration
- Check disk space in `data/` directory
- Ensure PDF files are valid

**Search Execution Hangs**
- Check OpenAI API configuration
- Verify vector database is built correctly
- Review search agent debug logs

**UI Not Updating**
- Check browser console for JavaScript errors
- Verify Svelte store subscriptions
- Clear browser cache and reload

### Debug Mode
Enable debug logging by opening browser console. All API calls and responses are logged for troubleshooting.

## Browser Support
- Chrome 80+
- Firefox 72+
- Safari 13+
- Edge 80+

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

This project is licensed under the MIT License.