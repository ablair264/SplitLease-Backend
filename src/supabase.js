const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error('Missing Supabase environment variables: SUPABASE_URL or SUPABASE_SERVICE_KEY');
}

// Create Supabase client with service role key
// This bypasses RLS policies for backend operations
const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false
  }
});

/**
 * Drivalia Jobs Service
 * Handles interaction with drivalia_jobs and drivalia_quotes tables
 */
class DrivaliaJobsService {
  /**
   * Get all pending jobs
   */
  async getPendingJobs() {
    const { data, error } = await supabase
      .from('drivalia_jobs')
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: true });

    if (error) throw error;
    return data;
  }

  /**
   * Get a specific job by ID
   */
  async getJob(jobId) {
    const { data, error } = await supabase
      .from('drivalia_jobs')
      .select('*')
      .eq('id', jobId)
      .single();

    if (error) throw error;
    return data;
  }

  /**
   * Update job status
   */
  async updateJobStatus(jobId, status, updates = {}) {
    const updateData = {
      status,
      ...updates
    };

    // Set timestamps based on status
    if (status === 'processing' && !updates.started_at) {
      updateData.started_at = new Date().toISOString();
    }
    if ((status === 'completed' || status === 'failed') && !updates.completed_at) {
      updateData.completed_at = new Date().toISOString();
    }

    const { data, error } = await supabase
      .from('drivalia_jobs')
      .update(updateData)
      .eq('id', jobId)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  /**
   * Insert quote result for a job
   */
  async insertQuote(jobId, vehicleId, quoteData) {
    const { data, error } = await supabase
      .from('drivalia_quotes')
      .insert({
        job_id: jobId,
        vehicle_id: vehicleId,
        manufacturer: quoteData.manufacturer,
        model: quoteData.model,
        variant: quoteData.variant,
        term: quoteData.term,
        mileage: quoteData.mileage,
        monthly_rental: quoteData.monthly_rental,
        initial_payment: quoteData.initial_payment,
        total_cost: quoteData.total_cost,
        maintenance_included: quoteData.maintenance_included,
        supplier_name: quoteData.supplier_name || 'Drivalia',
        quote_reference: quoteData.quote_reference,
        additional_info: quoteData.additional_info,
        fetched_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  /**
   * Bulk insert quotes for a job
   */
  async insertQuotes(jobId, quotes) {
    const quoteRecords = quotes.map(quote => ({
      job_id: jobId,
      vehicle_id: quote.vehicle_id,
      manufacturer: quote.manufacturer,
      model: quote.model,
      variant: quote.variant,
      term: quote.term,
      mileage: quote.mileage,
      monthly_rental: quote.monthly_rental,
      initial_payment: quote.initial_payment,
      total_cost: quote.total_cost,
      maintenance_included: quote.maintenance_included,
      supplier_name: quote.supplier_name || 'Drivalia',
      quote_reference: quote.quote_reference,
      additional_info: quote.additional_info,
      fetched_at: new Date().toISOString()
    }));

    const { data, error } = await supabase
      .from('drivalia_quotes')
      .insert(quoteRecords)
      .select();

    if (error) throw error;
    return data;
  }

  /**
   * Get all quotes for a job
   */
  async getJobQuotes(jobId) {
    const { data, error } = await supabase
      .from('drivalia_quotes')
      .select('*')
      .eq('job_id', jobId)
      .order('manufacturer, model, variant, term, mileage');

    if (error) throw error;
    return data;
  }

  /**
   * Mark job as processing
   */
  async startProcessingJob(jobId) {
    return this.updateJobStatus(jobId, 'processing', {
      started_at: new Date().toISOString()
    });
  }

  /**
   * Mark job as completed with summary
   */
  async completeJob(jobId, successCount, failureCount, durationSeconds) {
    return this.updateJobStatus(jobId, 'completed', {
      success_count: successCount,
      failure_count: failureCount,
      duration_seconds: durationSeconds,
      completed_at: new Date().toISOString()
    });
  }

  /**
   * Mark job as failed with error details
   */
  async failJob(jobId, errorDetails, failureCount = 0) {
    return this.updateJobStatus(jobId, 'failed', {
      error_details: errorDetails,
      failure_count: failureCount,
      completed_at: new Date().toISOString()
    });
  }
}

module.exports = {
  supabase,
  drivaliaJobsService: new DrivaliaJobsService()
};

/**
 * Lex Jobs Service
 * Handles interaction with lex_jobs and lex_quotes tables
 */
class LexJobsService {
  async getJobs(limit = 50) {
    const { data, error } = await supabase
      .from('lex_jobs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return data || [];
  }

  async getPendingJobs() {
    const { data, error } = await supabase
      .from('lex_jobs')
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: true });
    if (error) throw error;
    return data || [];
  }

  async createJob(payload) {
    const { vehicles = [], config = {} } = payload || {};
    const { data, error } = await supabase
      .from('lex_jobs')
      .insert({
        vehicles,
        config,
        vehicle_count: vehicles.length,
        status: 'pending'
      })
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  async getJob(jobId) {
    const { data, error } = await supabase
      .from('lex_jobs')
      .select('*')
      .eq('id', jobId)
      .single();
    if (error) throw error;
    return data;
  }

  async updateJob(jobId, updates) {
    const { data, error } = await supabase
      .from('lex_jobs')
      .update(updates)
      .eq('id', jobId)
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  async startProcessingJob(jobId) {
    return this.updateJob(jobId, {
      status: 'processing',
      started_at: new Date().toISOString()
    });
  }

  async completeJob(jobId, { successCount, failureCount, durationSeconds }) {
    return this.updateJob(jobId, {
      status: 'completed',
      success_count: successCount,
      failure_count: failureCount,
      duration_seconds: durationSeconds,
      completed_at: new Date().toISOString()
    });
  }

  async failJob(jobId, errorDetails, failureCount = 0) {
    return this.updateJob(jobId, {
      status: 'failed',
      error_details: errorDetails,
      failure_count: failureCount,
      completed_at: new Date().toISOString()
    });
  }

  async insertQuotes(jobId, quotes) {
    if (!quotes || quotes.length === 0) return [];
    const rows = quotes.map((q) => ({
      job_id: jobId,
      vehicle_id: q.vehicle_id,
      manufacturer: q.manufacturer,
      model: q.model,
      variant: q.variant,
      term: q.term,
      mileage: q.mileage,
      monthly_rental: q.monthly_rental ?? null,
      initial_rental: q.initial_rental ?? null,
      total_cost: q.total_cost ?? null,
      co2: q.co2 ?? null,
      fuel_type: q.fuel_type ?? null,
      p11d: q.p11d ?? null,
      vat: q.vat ?? null,
      maintenance: q.maintenance ?? false,
      discount_type: q.discount_type ?? null,
      discount_percent: q.discount_percent ?? null,
      quote_id: q.quote_id ?? null,
      lex_line_number: q.lex_line_number ?? null,
      fetched_at: new Date().toISOString(),
    }));
    const { data, error } = await supabase
      .from('lex_quotes')
      .insert(rows)
      .select();
    if (error) throw error;
    return data || [];
  }

  async getJobQuotes(jobId) {
    const { data, error } = await supabase
      .from('lex_quotes')
      .select('*')
      .eq('job_id', jobId)
      .order('manufacturer', { ascending: true })
      .order('model', { ascending: true })
      .order('variant', { ascending: true })
      .order('term', { ascending: true })
      .order('mileage', { ascending: true });
    if (error) throw error;
    return data || [];
  }
}

module.exports.lexJobsService = new LexJobsService();
