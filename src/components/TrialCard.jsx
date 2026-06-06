import React, { memo, useMemo, useCallback } from 'react';
import { Calendar, MapPin, FlaskConical, Activity, Image as ImageIcon, ChevronRight, Edit, MoreVertical, Eye, Copy, FolderOpen, FileDown, ScanLine, MonitorPlay, Archive, FileCode, FileSpreadsheet, Share2, BrainCircuit, Trash2, Camera, CheckCircle, Clock, Pencil } from 'lucide-react';
import { safeJsonParse } from '../utils/helpers.js';
import { formatDateTime } from '../utils/dateUtils.js';

const RESULT_COLORS = {
  'Excellent': 'bg-emerald-100 text-emerald-700',
  'Good': 'bg-blue-100 text-blue-700',
  'Fair': 'bg-amber-100 text-amber-700',
  'Poor': 'bg-red-100 text-red-700',
  'Control': 'bg-purple-100 text-purple-700',
};

const RESULT_BORDER_COLORS = {
  'Excellent': 'border-l-4 border-emerald-500',
  'Good': 'border-l-4 border-blue-500',
  'Fair': 'border-l-4 border-amber-500',
  'Poor': 'border-l-4 border-red-500',
  '': 'border-l-4 border-slate-200',
};

function ResultBadge({ result }) {
  const style = RESULT_COLORS[result] || 'bg-slate-100 text-slate-600';
  return (
    <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${style}`}>
      {result || 'Unrated'}
    </span>
  );
}

const TrialCard = memo(function TrialCard({
  trial,
  project,
  isSelected,
  isMenuOpen,
  onToggleBulk,
  onToggleMenu,
  onViewDetails,
  onEdit,
  onDuplicate,
  onMoveToProject,
  onExportPdf,
  onExportSciPdf,
  onExportPpt,
  onExportHtml,
  onExportTxt,
  onExportCsv,
  onExportJson,
  onShare,
  onAiGenerate,
  onDelete,
  onActivateToggle,
  onQuickRate,
  onQuickPhoto,
  onQuickGalleryUpload,
  onMarkComplete,
  onEditControlDays,
}) {
  const photos = useMemo(() => safeJsonParse(trial.PhotoURLs, []), [trial.PhotoURLs]);
  const efficacyData = useMemo(() => safeJsonParse(trial.EfficacyDataJSON, []), [trial.EfficacyDataJSON]);
  const isLive = String(trial.IsLive) !== 'false';
  const isCompleted = trial.IsCompleted === true || trial.IsCompleted === 'true';

  // Control days calculation
  const controlDays = useMemo(() => {
    if (trial.FinalControlDuration) return parseInt(trial.FinalControlDuration, 10);
    if (!trial.Date) return null;
    const start = new Date(trial.Date);
    const end = isCompleted && trial.FinalizationDate ? new Date(trial.FinalizationDate) : new Date();
    return Math.max(0, Math.round((end - start) / 86400000));
  }, [trial.Date, trial.FinalControlDuration, trial.FinalizationDate, isCompleted]);

  const handleCardClick = useCallback(() => {
    onToggleBulk(trial.ID);
  }, [onToggleBulk, trial.ID]);

  const handleMenuClick = useCallback((e) => {
    e.stopPropagation();
    onToggleMenu(trial.ID);
  }, [onToggleMenu, trial.ID]);

  const handleViewDetails = useCallback(() => {
    onViewDetails(trial);
    onToggleMenu(null);
  }, [onViewDetails, trial, onToggleMenu]);

  const handleEdit = useCallback((e) => {
    e.stopPropagation();
    onEdit(trial, false);
  }, [onEdit, trial]);

  const handleDuplicate = useCallback(() => {
    onDuplicate(trial);
    onToggleMenu(null);
  }, [onDuplicate, trial, onToggleMenu]);

  const handleMove = useCallback(() => {
    onMoveToProject(trial);
    onToggleMenu(null);
  }, [onMoveToProject, trial, onToggleMenu]);

  const handleExportPdf = useCallback(() => {
    onExportPdf(trial);
    onToggleMenu(null);
  }, [onExportPdf, trial, onToggleMenu]);

  const handleExportSciPdf = useCallback(() => {
    onExportSciPdf(trial);
    onToggleMenu(null);
  }, [onExportSciPdf, trial, onToggleMenu]);

  const handleExportPpt = useCallback(() => {
    onExportPpt(trial);
    onToggleMenu(null);
  }, [onExportPpt, trial, onToggleMenu]);

  const handleExportHtml = useCallback(() => {
    onExportHtml(trial);
    onToggleMenu(null);
  }, [onExportHtml, trial, onToggleMenu]);

  const handleExportTxt = useCallback(() => {
    onExportTxt(trial);
    onToggleMenu(null);
  }, [onExportTxt, trial, onToggleMenu]);

  const handleExportCsv = useCallback(() => {
    onExportCsv(trial);
    onToggleMenu(null);
  }, [onExportCsv, trial, onToggleMenu]);

  const handleExportJson = useCallback(() => {
    onExportJson(trial);
    onToggleMenu(null);
  }, [onExportJson, trial, onToggleMenu]);

  const handleShare = useCallback(() => {
    onShare(trial);
    onToggleMenu(null);
  }, [onShare, trial, onToggleMenu]);

  const handleAiGenerate = useCallback(() => {
    onAiGenerate(trial);
    onToggleMenu(null);
  }, [onAiGenerate, trial, onToggleMenu]);

  const handleDelete = useCallback((e) => {
    onDelete(trial.ID, e);
    onToggleMenu(null);
  }, [onDelete, trial.ID, onToggleMenu]);

  const handleActivateToggle = useCallback(() => {
    onActivateToggle(trial);
  }, [onActivateToggle, trial]);

  const handleQuickRate = useCallback((e, rating) => {
    e.stopPropagation();
    onQuickRate && onQuickRate(trial, rating);
  }, [onQuickRate, trial]);

  const handleQuickPhoto = useCallback((e) => {
    e.stopPropagation();
    onQuickPhoto && onQuickPhoto(trial);
  }, [onQuickPhoto, trial]);

  const handleQuickGalleryUpload = useCallback((e) => {
    e.stopPropagation();
    onQuickGalleryUpload && onQuickGalleryUpload(trial);
  }, [onQuickGalleryUpload, trial]);

  const handleMarkComplete = useCallback((e) => {
    e.stopPropagation();
    onMarkComplete && onMarkComplete(trial);
  }, [onMarkComplete, trial]);

  const handleEditControlDays = useCallback((e) => {
    e.stopPropagation();
    onEditControlDays && onEditControlDays(trial);
  }, [onEditControlDays, trial]);

  const stopPropagation = useCallback((e) => e.stopPropagation(), []);

  const resultBorderClass = RESULT_BORDER_COLORS[trial.Result || ''] || RESULT_BORDER_COLORS[''];

  return (
    <div
      onClick={handleCardClick}
      className={`bg-white rounded-xl shadow-sm relative transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md cursor-pointer flex flex-col
        ${resultBorderClass}
        ${isSelected ? 'border-2 border-emerald-500 ring-2 ring-emerald-100' : 'border border-slate-100 hover:border-emerald-300'}`}
    >
      {/* Checkbox */}
      <div className={`absolute top-3 left-3 w-5 h-5 rounded border-2 flex items-center justify-center transition ${isSelected ? 'bg-emerald-500 border-emerald-500' : 'border-slate-300 bg-white'}`}>
        {isSelected && (
          <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        )}
      </div>

      <div className="p-4 pt-10 flex-1 flex flex-col">
        <div className="flex items-start justify-between gap-3 mb-2">
          <div className="min-w-0">
            <h3 className="font-bold text-slate-800 truncate" title={trial.FormulationName}>{trial.FormulationName || 'Untitled'}</h3>
            <div className="flex items-center gap-2 mt-0.5">
              {trial.IsControl && <span className="text-[10px] bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded">Control</span>}
              {trial.IsStandardCheck && <span className="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">Standard</span>}
              {trial.IsCompleted && <span className="text-[10px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded">Finalized</span>}
              {project && <span className="text-xs text-emerald-600 font-medium truncate block">{project.Name}</span>}
            </div>
          </div>
          <div className="flex gap-1 shrink-0" onClick={stopPropagation}>
            <button onClick={handleEdit} className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded" title="Edit">
              <Edit className="w-3.5 h-3.5" />
            </button>
            {/* 3-dot menu */}
            <div className="relative">
              <button
                onClick={handleMenuClick}
                className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded" title="More actions">
                <MoreVertical className="w-3.5 h-3.5" />
              </button>
              {isMenuOpen && (
                <div className="absolute right-0 top-8 z-50 bg-white rounded-xl shadow-2xl border border-slate-200 min-w-44 py-1" onClick={stopPropagation}>
                  <button onClick={handleViewDetails} className="w-full flex items-center gap-2 px-3 py-2 text-xs text-slate-700 hover:bg-slate-50">
                    <Eye className="w-3.5 h-3.5 text-slate-500" /> View Details
                  </button>
                  <button onClick={handleDuplicate} className="w-full flex items-center gap-2 px-3 py-2 text-xs text-slate-700 hover:bg-slate-50">
                    <Copy className="w-3.5 h-3.5 text-emerald-500" /> Duplicate
                  </button>
                  <button onClick={handleMove} className="w-full flex items-center gap-2 px-3 py-2 text-xs text-slate-700 hover:bg-slate-50">
                    <FolderOpen className="w-3.5 h-3.5 text-blue-500" /> Move to Project
                  </button>
                  <hr className="my-1 border-slate-100" />
                  <button onClick={handleExportPdf} className="w-full flex items-center gap-2 px-3 py-2 text-xs text-slate-700 hover:bg-slate-50">
                    <FileDown className="w-3.5 h-3.5 text-red-500" /> Comprehensive PDF
                  </button>
                  <button onClick={handleExportSciPdf} className="w-full flex items-center gap-2 px-3 py-2 text-xs text-slate-700 hover:bg-slate-50">
                    <ScanLine className="w-3.5 h-3.5 text-indigo-500" /> Scientific PDF
                  </button>
                  <button onClick={handleExportPpt} className="w-full flex items-center gap-2 px-3 py-2 text-xs text-slate-700 hover:bg-slate-50">
                    <MonitorPlay className="w-3.5 h-3.5 text-orange-500" /> PowerPoint (.pptx)
                  </button>
                  <button onClick={handleExportHtml} className="w-full flex items-center gap-2 px-3 py-2 text-xs text-slate-700 hover:bg-slate-50">
                    <Archive className="w-3.5 h-3.5 text-blue-500" /> HTML Report
                  </button>
                  <button onClick={handleExportTxt} className="w-full flex items-center gap-2 px-3 py-2 text-xs text-slate-700 hover:bg-slate-50">
                    <FileCode className="w-3.5 h-3.5 text-slate-500" /> Field Report (.txt)
                  </button>
                  <button onClick={handleExportCsv} className="w-full flex items-center gap-2 px-3 py-2 text-xs text-slate-700 hover:bg-slate-50">
                    <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-500" /> Export CSV
                  </button>
                  <button onClick={handleExportJson} className="w-full flex items-center gap-2 px-3 py-2 text-xs text-slate-700 hover:bg-slate-50">
                    <FileDown className="w-3.5 h-3.5 text-violet-500" /> Export JSON
                  </button>
                  <button onClick={handleShare} className="w-full flex items-center gap-2 px-3 py-2 text-xs text-slate-700 hover:bg-slate-50">
                    <Share2 className="w-3.5 h-3.5 text-sky-500" /> Share / Copy
                  </button>
                  <hr className="my-1 border-slate-100" />
                  <button onClick={handleAiGenerate} className="w-full flex items-center gap-2 px-3 py-2 text-xs text-slate-700 hover:bg-violet-50">
                    <BrainCircuit className="w-3.5 h-3.5 text-violet-500" /> Generate AI Report
                  </button>
                  <hr className="my-1 border-slate-100" />
                  <button onClick={handleDelete} className="w-full flex items-center gap-2 px-3 py-2 text-xs text-red-600 hover:bg-red-50">
                    <Trash2 className="w-3.5 h-3.5" /> Delete
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="space-y-1.5 text-xs text-slate-500">
          <div className="flex items-center gap-1.5"><Calendar className="w-3.5 h-3.5 shrink-0" /><span>{formatDateTime(trial.Date) || '—'}</span></div>
          <div className="flex items-center gap-1.5"><MapPin className="w-3.5 h-3.5 shrink-0" /><span className="truncate">{trial.Location || '—'}</span></div>
          <div className="flex items-center gap-1.5"><FlaskConical className="w-3.5 h-3.5 shrink-0" /><span className="truncate">{trial.Dosage || '—'}</span></div>
          {trial.WeedSpecies && <div className="flex items-center gap-1.5"><Activity className="w-3.5 h-3.5 shrink-0" /><span className="truncate">{trial.WeedSpecies}</span></div>}
          {controlDays !== null && (
            <div className="flex items-center gap-1.5" onClick={stopPropagation}>
              <Clock className="w-3.5 h-3.5 shrink-0" />
              <span className={isCompleted ? 'text-emerald-600 font-semibold' : 'text-blue-600 font-semibold'}>
                {controlDays}d control{isCompleted ? ' (finalized)' : ''}
              </span>
              <button onClick={handleEditControlDays} title="Edit control days" className="text-slate-300 hover:text-slate-600 transition">
                <Pencil className="w-3 h-3" />
              </button>
            </div>
          )}
        </div>

        {/* Quick Rating */}
        <div className="mt-2 flex items-center gap-1" onClick={stopPropagation}>
          <span className="text-[10px] text-slate-400 mr-0.5">Rate:</span>
          {[['Excellent','bg-emerald-500'],['Good','bg-blue-500'],['Fair','bg-amber-500'],['Poor','bg-red-500']].map(([r, col]) => (
            <button key={r} onClick={e => handleQuickRate(e, r)}
              title={trial.Result === r ? `${r} — tap to clear` : r}
              className={`text-[9px] font-bold px-1.5 py-0.5 rounded transition ${
                trial.Result === r
                  ? `${col} text-white ring-2 ring-offset-1 ring-current`
                  : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
              }`}>
              {r[0]}
            </button>
          ))}
          {trial.Result && (
            <button onClick={e => handleQuickRate(e, trial.Result)} title="Clear rating"
              className="text-[9px] text-slate-400 hover:text-red-500 ml-0.5 transition">
              ×
            </button>
          )}
        </div>

        <div className="mt-3 flex items-center gap-2 flex-wrap">
          <ResultBadge result={trial.Result} />
          {photos.length > 0 && <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full flex items-center gap-1"><ImageIcon className="w-3 h-3" />{photos.length}</span>}
          {efficacyData.length > 0 && <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">{efficacyData.length} obs</span>}
          {trial.YieldValue && <span className="text-xs bg-teal-50 text-teal-700 px-2 py-0.5 rounded-full font-semibold">{trial.YieldValue} t/ha</span>}
        </div>
        <div className="mt-2 flex items-center justify-between" onClick={stopPropagation}>
          <div className="flex items-center gap-1.5">
            <span className={`w-2 h-2 rounded-full ${isLive ? 'bg-green-500' : 'bg-slate-400'}`} />
            <span className={`text-[10px] font-bold ${isLive ? 'text-green-700' : 'text-slate-500'}`}>{isLive ? 'LIVE' : 'INACTIVE'}</span>
          </div>
          <div className="flex items-center gap-1">
            {!isCompleted && (
              <button onClick={handleMarkComplete}
                title="Mark as Completed"
                className="text-[10px] font-bold px-2 py-0.5 rounded border bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100 flex items-center gap-0.5 transition">
                <CheckCircle className="w-3 h-3" /> Done
              </button>
            )}
            <button
              onClick={handleActivateToggle}
              className={`text-[10px] font-bold px-2 py-0.5 rounded border transition ${
                isLive
                  ? 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100'
                  : 'bg-green-50 text-green-700 border-green-200 hover:bg-green-100'
              }`}>
              {isLive ? 'Deactivate' : 'Activate'}
            </button>
          </div>
        </div>
      </div>

      <div className="border-t px-3 py-2 flex items-center justify-between" onClick={stopPropagation}>
        <div className="flex gap-1">
          <button onClick={handleQuickPhoto}
            title="Add Photo"
            className="flex items-center gap-1 text-[11px] font-semibold text-blue-600 hover:bg-blue-50 px-2 py-1 rounded-lg transition">
            <Camera className="w-3.5 h-3.5" /> Photo
          </button>
          <button onClick={handleQuickGalleryUpload}
            title="Upload from Gallery"
            className="flex items-center gap-1 text-[11px] font-semibold text-blue-600 hover:bg-blue-50 px-2 py-1 rounded-lg transition">
            <ImageIcon className="w-3.5 h-3.5" /> Gallery
          </button>
        </div>
        <button onClick={() => onViewDetails(trial)}
          className="text-xs text-emerald-600 font-semibold flex items-center gap-1 hover:underline">
          View Details <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
});

export default TrialCard;
