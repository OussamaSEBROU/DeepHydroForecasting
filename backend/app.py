# app.py
from flask import Flask, request, jsonify, send_file, send_from_directory
from flask_cors import CORS
import pandas as pd
import numpy as np
import io
import os
from datetime import timedelta
from sklearn.preprocessing import MinMaxScaler
from sklearn.metrics import mean_squared_error, mean_absolute_error
from scipy.stats import t
import tensorflow as tf
from tensorflow.keras.models import load_model # type: ignore
from reportlab.lib.pagesizes import letter
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, PageBreak, Image, Table, TableStyle
from reportlab.lib.styles import getSampleStyleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib import colors
import google.generativeai as genai # type: ignore

app = Flask(__name__, static_folder='build', static_url_path='/')
CORS(app) # Enable CORS for all routes

# Global variables for data (in-memory for simplicity in this prototype)
# In a production app, this would be stored in a database (e.g., Firestore)
# associated with user sessions or IDs.
current_historical_data = pd.DataFrame()
current_forecast_data = pd.DataFrame() # Store forecast data for report/chat context

# Load pre-trained model
MODEL_PATH = 'standard_model.h5'
model = None
try:
    if os.path.exists(MODEL_PATH):
        model = load_model(MODEL_PATH)
        print(f"Model loaded successfully from {MODEL_PATH}")
    else:
        print(f"Model file not found at {MODEL_PATH}. Forecasting will not work.")
except Exception as e:
    print(f"Error loading model: {e}")
    model = None

# Configure Gemini API
genai.configure(api_key=os.environ.get("GEMINI_API_KEY", ""))

# Helper to create sequences for LSTM/RNN models
def create_sequences(data, n_steps):
    X, y = [], []
    for i in range(len(data) - n_steps):
        X.append(data[i:(i + n_steps), 0]) # Assuming single feature
        y.append(data[i + n_steps, 0])
    return np.array(X), np.array(y)

# Function to generate a dummy model (if needed for local testing without a real .h5)
def generate_dummy_model(output_path='standard_model.h5'):
    from tensorflow.keras.models import Sequential # type: ignore
    from tensorflow.keras.layers import LSTM, Dense # type: ignore
    # A very simple LSTM model for demonstration
    model = Sequential([
        LSTM(50, activation='relu', input_shape=(1, 1)), # input_shape = (timesteps, features)
        Dense(1)
    ])
    model.compile(optimizer='adam', loss='mse')
    model.save(output_path)
    print(f"Dummy model saved to {output_path}")

# Run this once if standard_model.h5 is missing for local development/testing
# if not os.path.exists(MODEL_PATH):
#     generate_dummy_model(MODEL_PATH)

# Add this route to serve the React app
@app.route('/', defaults={'path': ''})
@app.route('/<path:path>')
def serve(path):
    if path != "" and os.path.exists(app.static_folder + '/' + path):
        return send_from_directory(app.static_folder, path)
    else:
        return send_from_directory(app.static_folder, 'index.html')

@app.route('/upload', methods=['POST'])
def upload_file():
    global current_historical_data
    if 'file' not in request.files:
        return jsonify({'error': 'No file part'}), 400
    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'No selected file'}), 400
    if file and file.filename.endswith('.xlsx'):
        try:
            df = pd.read_excel(file.stream)
            if 'date' not in df.columns or 'level' not in df.columns:
                return jsonify({'error': 'Excel file must contain "date" and "level" columns'}), 400

            # Ensure date column is datetime objects
            df['date'] = pd.to_datetime(df['date'])
            df['level'] = pd.to_numeric(df['level'], errors='coerce')
            df.dropna(subset=['date', 'level'], inplace=True)
            df.sort_values('date', inplace=True)

            current_historical_data = df.copy()
            return jsonify({'message': 'File uploaded and processed successfully', 'data': df.to_dict(orient='records')}), 200
        except Exception as e:
            return jsonify({'error': f'Error processing file: {str(e)}'}), 500
    return jsonify({'error': 'Invalid file type. Please upload an .xlsx file.'}), 400

@app.route('/analyze', methods=['POST'])
def analyze_data():
    if current_historical_data.empty:
        return jsonify({'error': 'No data uploaded for analysis.'}), 400

    df = current_historical_data.copy()

    # Basic Statistics
    stats = {
        'mean_level': df['level'].mean(),
        'median_level': df['level'].median(),
        'min_level': df['level'].min(),
        'max_level': df['level'].max(),
        'std_dev': df['level'].std(),
        'data_points': len(df),
        'start_date': df['date'].min().strftime('%Y-%m-%d'),
        'end_date': df['date'].max().strftime('%Y-%m-%d')
    }

    # Trend detection (simple linear regression slope or general observation)
    # For a more robust trend, seasonal-trend decomposition (STL) could be used
    if len(df) > 1:
        time_diff = (df['date'] - df['date'].min()).dt.days.values
        coeffs = np.polyfit(time_diff, df['level'], 1)
        slope = coeffs[0]
        if slope > 0.01: # Arbitrary threshold
            trend = "Upward trend"
        elif slope < -0.01:
            trend = "Downward trend"
        else:
            trend = "Relatively stable trend"
    else:
        trend = "Not enough data for trend analysis."

    # Simple seasonality check (e.g., monthly variations, requires more data)
    # A more advanced approach would use autocorrelation or FFT
    seasonality = "No obvious strong seasonality detected (requires more advanced analysis)."
    if len(df) > 24: # At least 2 years of monthly data for a rough seasonal check
        monthly_avg = df.set_index('date').groupby(pd.Grouper(freq='M'))['level'].mean()
        if not monthly_avg.empty:
            # Check for high variance across months to indicate seasonality
            if monthly_avg.groupby(monthly_avg.index.month).std().mean() > 0.5 * df['level'].std(): # Threshold
                seasonality = "Possible seasonal pattern detected (e.g., yearly cycles)."

    # Smart key insights (simplified for now)
    insights = "The data provides a historical record of groundwater levels. "
    if trend == "Upward trend":
        insights += "An increasing trend in groundwater levels is observed, which might indicate higher recharge or reduced extraction."
    elif trend == "Downward trend":
        insights += "A decreasing trend is evident, suggesting potential over-extraction or reduced recharge."
    else:
        insights += "Levels appear relatively stable over the period."
    if seasonality.startswith("Possible seasonal pattern"):
        insights += " Additionally, there are indications of seasonal variations, likely influenced by rainfall or irrigation cycles."
    else:
        insights += " No prominent seasonal patterns were automatically detected."

    return jsonify({
        'stats': stats,
        'trend': trend,
        'seasonality': seasonality,
        'insights': insights
    }), 200

@app.route('/forecast', methods=['POST'])
def forecast_levels():
    global current_forecast_data
    req_data = request.json
    if not req_data or 'data' not in req_data or 'months' not in req_data:
        return jsonify({'error': 'Invalid request data'}), 400

    input_data = pd.DataFrame(req_data['data'])
    input_data['date'] = pd.to_datetime(input_data['date'])
    input_data['level'] = pd.to_numeric(input_data['level'])
    input_data.sort_values('date', inplace=True)

    months_to_forecast = int(req_data['months'])

    if model is None:
        return jsonify({'error': 'Forecasting model not loaded. Please ensure standard_model.h5 exists.'}), 500

    if input_data.empty or len(input_data) < 2: # Need at least 2 points for scaling
        return jsonify({'error': 'Insufficient historical data for forecasting. Need at least two data points.'}), 400

    try:
        # Prepare data for forecasting
        scaler = MinMaxScaler(feature_range=(0, 1))
        scaled_data = scaler.fit_transform(input_data['level'].values.reshape(-1, 1))

        # LSTM expects 3D input: [samples, timesteps, features]
        # For simplicity, assume 1 timestep and 1 feature for prediction.
        # In a real scenario, `n_steps` should be determined by model training.
        n_steps = 1 # Assuming the model takes the last single observation to predict the next
        
        # Prepare last `n_steps` data points for initial prediction
        last_n_steps_data = scaled_data[-n_steps:].reshape(1, n_steps, 1)

        forecast_levels = []
        confidence_intervals = []
        current_prediction_input = last_n_steps_data

        # Simple error estimation for CI (replace with proper quantile regression if model supports it)
        # Calculate residuals on training data or use a fixed std dev
        if len(input_data) > n_steps:
            # Recreate sequences for historical data for error estimation
            X_hist, y_hist = create_sequences(scaled_data, n_steps)
            hist_preds = model.predict(X_hist.reshape(X_hist.shape[0], X_hist.shape[1], 1)).flatten()
            hist_residuals = y_hist - hist_preds
            rmse_hist = np.sqrt(mean_squared_error(y_hist, hist_preds))
            std_err_of_pred = np.std(hist_residuals) # Simplified, should consider full model uncertainty
        else:
            # Fallback for very small datasets
            std_err_of_pred = 0.05 # A small arbitrary value if residuals cannot be calculated

        # Degrees of freedom for t-distribution (n - num_parameters in model, simplified)
        df_t = max(1, len(input_data) - n_steps - 1)
        # For 95% CI, alpha = 0.05, two-tailed, so alpha/2 = 0.025
        t_critical = t.ppf(0.975, df_t)

        for i in range(months_to_forecast):
            # Predict next step
            predicted_scaled_level = model.predict(current_prediction_input)[0, 0]

            # Invert scaling
            predicted_level = scaler.inverse_transform([[predicted_scaled_level]])[0, 0]
            forecast_levels.append(predicted_level)

            # Calculate confidence intervals (simplified)
            # This is a very basic method. For proper CI, a model that outputs uncertainty
            # or Bayesian methods would be needed.
            margin_of_error_scaled = t_critical * std_err_of_pred
            lower_ci_scaled = predicted_scaled_level - margin_of_error_scaled
            upper_ci_scaled = predicted_scaled_level + margin_of_error_scaled

            lower_ci = scaler.inverse_transform([[lower_ci_scaled]])[0, 0]
            upper_ci = scaler.inverse_transform([[upper_ci_scaled]])[0, 0]
            confidence_intervals.append({'lower_ci': lower_ci, 'upper_ci': upper_ci})

            # Update input for next prediction (autoregressive forecasting)
            current_prediction_input = np.array([predicted_scaled_level]).reshape(1, n_steps, 1)

        # Generate forecast dates
        last_date = input_data['date'].max()
        forecast_dates = [last_date + timedelta(days=30 * (i + 1)) for i in range(months_to_forecast)]

        forecast_df = pd.DataFrame({
            'date': forecast_dates,
            'level': forecast_levels,
            'lower_ci': [ci['lower_ci'] for ci in confidence_intervals],
            'upper_ci': [ci['upper_ci'] for ci in confidence_intervals],
        })
        current_forecast_data = forecast_df.copy()

        # Calculate metrics against historical data (this is more for evaluation, not real forecast metrics)
        # For a true forecast evaluation, you need a test set not used in training.
        # Here, we will just provide dummy values or simplified metrics as the model isn't trained here.
        # Real RMSE/MAE/MAPE should be calculated on a validation set.
        # For this prototype, we'll return placeholder metrics.
        metrics = {
            'rmse': 0.0, # Placeholder
            'mae': 0.0,  # Placeholder
            'mape': 0.0  # Placeholder
        }
        if len(input_data) > n_steps: # Only if there's enough historical data to "predict" on
            # Let's use the RMSE calculated from historical data for the model performance, as a proxy
            metrics['rmse'] = rmse_hist if 'rmse_hist' in locals() else 0.0
            metrics['mae'] = np.mean(np.abs(hist_residuals)) if 'hist_residuals' in locals() else 0.0
            # MAPE can be tricky with values near zero, use a robust version if needed
            metrics['mape'] = np.mean(np.abs(hist_residuals / y_hist)) * 100 if 'hist_residuals' in locals() and np.all(y_hist != 0) else 0.0


        return jsonify({
            'message': 'Forecast generated successfully',
            'forecast': forecast_df.to_dict(orient='records'),
            'metrics': metrics
        }), 200
    except Exception as e:
        return jsonify({'error': f'Error during forecasting: {str(e)}'}), 500

@app.route('/generate_report', methods=['POST'])
def generate_report():
    req_data = request.json
    if not req_data or 'historical_data' not in req_data or 'language' not in req_data:
        return jsonify({'error': 'Invalid request data'}), 400

    historical_df = pd.DataFrame(req_data['historical_data'])
    historical_df['date'] = pd.to_datetime(historical_df['date'])
    historical_df['level'] = pd.to_numeric(historical_df['level'])

    forecast_df = pd.DataFrame(req_data.get('forecast_data', []))
    if not forecast_df.empty:
        forecast_df['date'] = pd.to_datetime(forecast_df['date'])
        forecast_df['level'] = pd.to_numeric(forecast_df['level'])

    language = req_data['language']
    
    # Generate report content using Gemini
    prompt_template_en = f"""
    You are an expert hydrogeologist with 20+ years of experience.
    Generate a comprehensive groundwater level analysis and forecasting report based on the following data.
    The report should be professional, insightful, and actionable.

    Historical Groundwater Data (Date, Level):
    {historical_df.to_string(index=False)}

    Forecasted Groundwater Data (Date, Level):
    {forecast_df.to_string(index=False) if not forecast_df.empty else "No forecast data available."}

    The report must include the following sections:
    1.  **Executive Summary:** A concise overview of findings and recommendations.
    2.  **Historical Data Insights:** Detailed analysis of historical trends, seasonality, and any anomalies. Discuss minimum, maximum, mean levels, and overall stability or change.
    3.  **Forecast Interpretation:** Analysis of the predicted future groundwater levels, including potential implications for water management, sustainability, and any associated risks or opportunities. Discuss the confidence intervals if applicable.
    4.  **Recommendations:** Actionable advice for water resource managers, policymakers, or landowners based on the analysis and forecast.
    
    Ensure the tone is authoritative and professional.
    """

    prompt_template_fr = f"""
    Vous êtes un hydrogéologue expert avec plus de 20 ans d'expérience.
    Générez un rapport complet d'analyse et de prévision du niveau des eaux souterraines basé sur les données suivantes.
    Le rapport doit être professionnel, perspicace et exploitable.

    Données historiques sur le niveau des eaux souterraines (Date, Niveau):
    {historical_df.to_string(index=False)}

    Données prévisionnelles sur le niveau des eaux souterraines (Date, Niveau):
    {forecast_df.to_string(index=False) if not forecast_df.empty else "Aucune donnée de prévision disponible."}

    Le rapport doit inclure les sections suivantes:
    1.  **Résumé Exécutif:** Un aperçu concis des conclusions et des recommandations.
    2.  **Analyse des Données Historiques:** Analyse détaillée des tendances historiques, de la saisonnalité et des anomalies. Discutez des niveaux minimum, maximum, moyen, et de la stabilité ou des changements globaux.
    3.  **Interprétation des Prévisions:** Analyse des niveaux futurs prévus des eaux souterraines, y compris les implications potentielles pour la gestion de l'eau, la durabilité et les risques ou opportunités associés. Discutez des intervalles de confiance si applicable.
    4.  **Recommandations:** Conseils exploitables pour les gestionnaires des ressources en eau, les décideurs ou les propriétaires fonciers basés sur l'analyse et les prévisions.

    Assurez-vous que le ton est autoritaire et professionnel.
    """

    prompt = prompt_template_fr if language == 'fr' else prompt_template_en

    try:
        model_name = "gemini-2.0-flash"
        if not genai.get_model(model_name):
            return jsonify({'error': 'Gemini model not found. Please check API key and model availability.'}), 500

        llm_model = genai.GenerativeModel(model_name)
        response = llm_model.generate_content(prompt)
        report_content_text = response.candidates[0].content.parts[0].text

        # Create PDF
        buffer = io.BytesIO()
        doc = SimpleDocTemplate(buffer, pagesize=letter)
        styles = getSampleStyleSheet()

        # Custom styles for professionalism
        styles.add(ParagraphStyle(name='Title', fontSize=24, leading=28, alignment=TA_CENTER, fontName='Helvetica-Bold'))
        styles.add(ParagraphStyle(name='Heading1', fontSize=18, leading=22, spaceAfter=12, fontName='Helvetica-Bold'))
        styles.add(ParagraphStyle(name='Heading2', fontSize=14, leading=18, spaceBefore=10, spaceAfter=6, fontName='Helvetica-Bold'))
        styles.add(ParagraphStyle(name='Normal', fontSize=10, leading=14, spaceAfter=6))
        styles.add(ParagraphStyle(name='Code', fontName='Courier', fontSize=9, leading=10, textColor=colors.darkblue, backColor=colors.lightgrey))

        story = []

        story.append(Paragraph("DeepHydro Forecasting: Groundwater Level Report", styles['Title']))
        story.append(Spacer(1, 0.2 * 25.4)) # 0.2 inch spacer
        story.append(Paragraph(f"Date: {pd.Timestamp.now().strftime('%Y-%m-%d')}", styles['Normal']))
        story.append(Spacer(1, 0.4 * 25.4))

        # Split the generated report content into sections
        sections = report_content_text.split('**Executive Summary:**')
        executive_summary = sections[1].split('**Historical Data Insights:**')[0].strip()
        historical_insights = sections[1].split('**Historical Data Insights:**')[1].split('**Forecast Interpretation:**')[0].strip()
        forecast_interpretation = sections[1].split('**Forecast Interpretation:**')[1].split('**Recommendations:**')[0].strip()
        recommendations = sections[1].split('**Recommendations:**')[1].strip()

        story.append(Paragraph("1. Executive Summary", styles['Heading1']))
        for line in executive_summary.split('\n'):
            story.append(Paragraph(line.strip(), styles['Normal']))
        story.append(Spacer(1, 0.2 * 25.4))

        story.append(Paragraph("2. Historical Data Insights", styles['Heading1']))
        # Add historical data table
        if not historical_df.empty:
            historical_data_display = historical_df.head(10).to_string(index=False) + (f"\n... and {len(historical_df) - 10} more rows" if len(historical_df) > 10 else "")
            story.append(Paragraph("Sample of Historical Data:", styles['Heading2']))
            story.append(Paragraph(historical_data_display, styles['Code']))
            story.append(Spacer(1, 0.2 * 25.4))
        for line in historical_insights.split('\n'):
            story.append(Paragraph(line.strip(), styles['Normal']))
        story.append(Spacer(1, 0.2 * 25.4))

        story.append(Paragraph("3. Forecast Interpretation", styles['Heading1']))
        # Add forecast data table
        if not forecast_df.empty:
            forecast_data_display = forecast_df.head(10).to_string(index=False) + (f"\n... and {len(forecast_df) - 10} more rows" if len(forecast_df) > 10 else "")
            story.append(Paragraph("Sample of Forecasted Data:", styles['Heading2']))
            story.append(Paragraph(forecast_data_display, styles['Code']))
            story.append(Spacer(1, 0.2 * 25.4))
        for line in forecast_interpretation.split('\n'):
            story.append(Paragraph(line.strip(), styles['Normal']))
        story.append(Spacer(1, 0.2 * 25.4))

        story.append(Paragraph("4. Recommendations", styles['Heading1']))
        for line in recommendations.split('\n'):
            story.append(Paragraph(line.strip(), styles['Normal']))
        story.append(Spacer(1, 0.2 * 25.4))


        doc.build(story)
        buffer.seek(0)
        return send_file(buffer, as_attachment=True, download_name='DeepHydro_Report.pdf', mimetype='application/pdf'), 200

    except Exception as e:
        return jsonify({'error': f'Error generating report: {str(e)}'}), 500

@app.route('/chat', methods=['POST'])
def chat_with_ai():
    req_data = request.json
    if not req_data or 'chat_history' not in req_data:
        return jsonify({'error': 'Invalid request data'}), 400

    chat_history_from_frontend = req_data['chat_history']
    historical_data_df = pd.DataFrame(req_data.get('historical_data', []))
    forecast_data_df = pd.DataFrame(req_data.get('forecast_data', []))

    # Construct the full chat history for Gemini, including a system instruction
    # and context about the data.
    context_data = ""
    if not historical_data_df.empty:
        context_data += "\n\nHistorical Groundwater Data:\n" + historical_data_df.to_string(index=False)
    if not forecast_data_df.empty:
        context_data += "\n\nForecasted Groundwater Data:\n" + forecast_data_df.to_string(index=False)

    # Transform frontend chat history to Gemini's expected format
    gemini_chat_history = []
    for msg in chat_history_from_frontend:
        gemini_chat_history.append({'role': msg['role'], 'parts': [{'text': msg['content']}]})

    # Add system instruction and context to the beginning of the history
    # This acts as a persona and provides data context
    system_instruction = {
        'role': 'user',
        'parts': [{'text': f"You are an expert hydrogeologist AI. Your goal is to provide insightful and accurate answers regarding groundwater levels, trends, and forecasts based on the provided historical and predicted data. Maintain a professional and helpful tone.{context_data}"}]
    }
    # If the history is not empty, ensure the system instruction is correctly interleaved,
    # or just prepend if it's the first message from user.
    # For simplicity, if chat history is empty, make the first message system instruction + user query.
    # Otherwise, just append user query.
    if not gemini_chat_history:
        gemini_chat_history.append(system_instruction)
    else:
        # If there's existing chat, append the context to the *first* user message or handle it appropriately
        # For simplicity, let's just make sure our latest user message (the last one) gets processed correctly
        # and the model has access to the full context.
        # A more robust solution for long conversations with context updates would be needed.
        pass


    try:
        model_name = "gemini-2.0-flash"
        if not genai.get_model(model_name):
            return jsonify({'error': 'Gemini model not found. Please check API key and model availability.'}), 500

        llm_model = genai.GenerativeModel(model_name)
        # Pass the full chat history directly to the model
        response = llm_model.generate_content(gemini_chat_history)
        ai_response_text = response.candidates[0].content.parts[0].text

        return jsonify({'response': ai_response_text}), 200

    except Exception as e:
        return jsonify({'error': f'Error during AI chat: {str(e)}'}), 500

if __name__ == '__main__':
    # When running locally, ensure dummy model is generated
    if not os.path.exists(MODEL_PATH):
        print("Generating dummy model...")
        generate_dummy_model(MODEL_PATH)
    app.run(debug=True, host='0.0.0.0', port=5000)