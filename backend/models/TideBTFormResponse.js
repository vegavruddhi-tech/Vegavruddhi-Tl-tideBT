const mongoose = require('mongoose');

const tideBTFormResponseSchema = new mongoose.Schema({
  submittedBy:      { type: mongoose.Schema.Types.ObjectId },
  employeeName:     { type: String },
  employeeEmail:    { type: String },
  formType:         { type: String, enum: ['daily-visit', 'mobikwik-withdraw'], default: 'daily-visit' },
  merchantName:     { type: String, required: true },
  merchantNumber:   { type: String, required: true },
  merchantOpinion:  { type: String },
  merchantCategory: { type: String },
  onboardingStatus: { type: String },
  merchantEmailId:  { type: String },
  transactionDate:  { type: Date },
  withdrawAmount:   { type: Number },
  withdrawFees:     { type: Number },
  reasonOfWithdraw: { type: String },
  createdAt:        { type: Date, default: Date.now }
}, { collection: 'TideBT Form Responses' });

module.exports = mongoose.model('TideBTFormResponse', tideBTFormResponseSchema);
