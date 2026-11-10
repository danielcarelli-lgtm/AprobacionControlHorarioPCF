import * as React from 'react';
import { useState, useEffect, useRef } from 'react';
import { IInputs } from "./generated/ManifestTypes";
import { Spinner, SpinnerSize, Icon, Stack, Text, IconButton, PrimaryButton } from '@fluentui/react';

export interface IAppProps {
    context: ComponentFramework.Context<IInputs>;
    region: string;
    width: number;
    height: number;
}

interface IResource {
    id: string;
    name: string;
}

interface ITimeEntry {
    id: string;
    start: Date;
    end: Date;
    typeFormatted: string;
    description: string;
    hasOt: boolean;
}

interface IDailyReport {
    id: string;
    statusReason: string;
    statusCode: number | null;
    startHour: number | null;
    endHour: number | null;
}

const VERSION = "v1.0.9";
const SENT_STATUS = 909540001;
const APPROVED_STATUS = 909540002;
const REJECTED_STATUS = 909540003;

const getRecord = (value: unknown): Record<string, unknown> | null =>
    typeof value === "object" && value !== null ? value as Record<string, unknown> : null;

const isSentStatus = (statusCode: number | null): boolean => statusCode === SENT_STATUS;

const getLocalDateKey = (date: Date): string =>
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

const getStatusClassName = (status: string): string => {
    const normalizedStatus = status.toLocaleLowerCase("es-ES");
    if (normalizedStatus.includes("rechaz") || normalizedStatus.includes("reject")) {
        return "ach-day-status--rejected";
    }
    if (normalizedStatus.includes("pendient") || normalizedStatus.includes("pending")) {
        return "ach-day-status--pending";
    }
    if (normalizedStatus.includes("aprob") || normalizedStatus.includes("approv") || normalizedStatus.includes("valid")) {
        return "ach-day-status--approved";
    }
    if (normalizedStatus.includes("enviad") || normalizedStatus.includes("sent")) {
        return "ach-day-status--sent";
    }
    return "ach-day-status--default";
};

const getTimeOfDay = (value: unknown): number | null => {
    if (typeof value !== "string") return null;

    const match = /(?:T|^)(\d{1,2}):(\d{2})/.exec(value);
    if (!match) return null;

    return Number(match[1]) + Number(match[2]) / 60;
};

const formatTimeOfDay = (time: number): string => {
    const hours = Math.floor(time);
    const minutes = Math.round((time - hours) * 60);
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
};

const renderTimeAxis = (side: "left" | "right") => (
    <div className={`ach-axis ach-axis--${side}`} aria-hidden="true">
        {[0, 4, 8, 12, 16, 20, 24].map(hour => (
            <div key={hour} className="ach-tick" style={{ top: `${(hour / 24) * 100}%` }}>
                {String(hour).padStart(2, "0")}:00
            </div>
        ))}
    </div>
);

const getErrorMessage = (error: unknown): string =>
    error instanceof Error ? error.message : String(error);

export const AprobacionControlHorarioApp: React.FC<IAppProps> = ({ context, region, width, height }) => {
    const [resources, setResources] = useState<IResource[]>([]);
    const [selectedResource, setSelectedResource] = useState<IResource | null>(null);
    const [resourceSearch, setResourceSearch] = useState<string>("");
    const [currentWeekStart, setCurrentWeekStart] = useState<Date>(getMonday(new Date()));
    const [timelineZoom, setTimelineZoom] = useState<number>(100);
    const [availableTimelineHeight, setAvailableTimelineHeight] = useState<number>(0);
    const gridContainerRef = useRef<HTMLDivElement>(null);
    const [timeEntries, setTimeEntries] = useState<Record<string, ITimeEntry[]>>({});
    const [dailyReports, setDailyReports] = useState<Record<string, IDailyReport>>({});
    const [isLoadingResources, setIsLoadingResources] = useState<boolean>(true);
    const [isLoadingEntries, setIsLoadingEntries] = useState<boolean>(false);
    const [isApproving, setIsApproving] = useState<boolean>(false);
    const [updatingReportIds, setUpdatingReportIds] = useState<string[]>([]);
    const [refreshKey, setRefreshKey] = useState<number>(0);
    const [errorMsg, setErrorMsg] = useState<string>("");
    const sentReports = Array.from({ length: 7 }, (_, index) => {
        const date = new Date(currentWeekStart);
        date.setDate(date.getDate() + index);
        return dailyReports[getLocalDateKey(date)];
    }).filter((report): report is IDailyReport => Boolean(report && isSentStatus(report.statusCode)));
    const normalizedResourceSearch = resourceSearch.trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("es-ES");
    const filteredResources = resources.filter(resource =>
        resource.name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("es-ES").includes(normalizedResourceSearch)
    );

    // Función auxiliar para obtener el Lunes de una fecha dada
    function getMonday(d: Date): Date {
        const date = new Date(d);
        const day = date.getDay();
        const diff = date.getDate() - day + (day === 0 ? -6 : 1);
        const monday = new Date(date.setDate(diff));
        monday.setHours(0, 0, 0, 0);
        return monday;
    }

    const changeWeek = (offset: number) => {
        const newMonday = new Date(currentWeekStart);
        newMonday.setDate(newMonday.getDate() + (offset * 7));
        setCurrentWeekStart(newMonday);
    };

    const changeTimelineZoom = (offset: number) => {
        setTimelineZoom(zoom => Math.min(160, Math.max(60, zoom + offset)));
    };

    useEffect(() => {
        const gridContainer = gridContainerRef.current;
        if (!gridContainer) return;

        const resizeObserver = new ResizeObserver(entries => {
            const entry = entries[0];
            if (entry) {
                setAvailableTimelineHeight(entry.contentRect.height);
            }
        });
        resizeObserver.observe(gridContainer);

        return () => resizeObserver.disconnect();
    }, []);

    // 1. Cargar Recursos al iniciar
    useEffect(() => {
        const loadResources = async () => {
            setIsLoadingResources(true);
            try {
                let filter = `statecode eq 0`; // Solo recursos activos
                
                // Si es España (1), filtramos por el email del usuario logueado
                if (region === "1") {
                    const currentUserId = context.userSettings.userId.replace(/[{}]/g, "");
                    const userRecord = await context.webAPI.retrieveRecord("systemuser", currentUserId, "?$select=internalemailaddress");
                    const userEmail: unknown = userRecord.internalemailaddress;
                    
                    if (typeof userEmail === "string" && userEmail.length > 0) {
                        filter += ` and pdw_mangeremail eq '${userEmail}'`;
                    }
                }

                const query = `?$select=bookableresourceid,name&$filter=${filter}&$orderby=name asc`;
                const results = await context.webAPI.retrieveMultipleRecords("bookableresource", query);
                
                const loadedResources = results.entities.reduce<IResource[]>((loaded, resource) => {
                    const id: unknown = resource.bookableresourceid;
                    const name: unknown = resource.name;
                    if (typeof id === "string" && typeof name === "string") {
                        loaded.push({ id, name });
                    }
                    return loaded;
                }, []);
                
                setResources(loadedResources);
                if (loadedResources.length > 0) {
                    setSelectedResource(loadedResources[0]);
                }
            } catch (err: unknown) {
                setErrorMsg("Error cargando recursos: " + getErrorMessage(err));
            } finally {
                setIsLoadingResources(false);
            }
        };

        void loadResources();
    }, [context, region]);

    // 2. Cargar Entradas de Tiempo al cambiar el recurso o la semana
    useEffect(() => {
        if (!selectedResource) return;

        const loadWeekEntries = async () => {
            setIsLoadingEntries(true);
            try {
                const sunday = new Date(currentWeekStart);
                sunday.setDate(sunday.getDate() + 6);
                sunday.setHours(23, 59, 59, 999);

                const filter = `_msdyn_bookableresource_value eq ${selectedResource.id} and msdyn_start ge ${currentWeekStart.toISOString()} and msdyn_start le ${sunday.toISOString()}`;
                const select = `msdyn_timeentryid,msdyn_start,msdyn_end,msdyn_type,msdyn_description,_msdyn_workorder_value`;
                
                const [results, reportResults] = await Promise.all([
                    context.webAPI.retrieveMultipleRecords("msdyn_timeentry", `?$filter=${filter}&$select=${select}`),
                    context.webAPI.retrieveMultipleRecords(
                        "sec_partediario",
                        `?$select=sec_partediarioid,sec_fecha,statuscode,sec_horainicio,sec_horafin&$filter=statecode eq 0 and _sec_recursoid_value eq ${selectedResource.id} and sec_fecha ge ${currentWeekStart.toISOString()} and sec_fecha le ${sunday.toISOString()}`
                    )
                ]);
                
                // Agrupar por fecha (YYYY-MM-DD)
                const grouped: Record<string, ITimeEntry[]> = {};
                const reportsByDate: Record<string, IDailyReport> = {};
                
                // Inicializar los 7 días vacíos
                for (let i = 0; i < 7; i++) {
                    const d = new Date(currentWeekStart);
                    d.setDate(d.getDate() + i);
                    const dateKey = getLocalDateKey(d);
                    grouped[dateKey] = [];
                }

                reportResults.entities.forEach(report => {
                    const date: unknown = report.sec_fecha;
                    if (typeof date !== "string") return;

                    const dateKey = date.split("T")[0];
                    const id: unknown = report.sec_partediarioid;
                    const statusReason: unknown = report["statuscode@OData.Community.Display.V1.FormattedValue"];
                    const statusCode: unknown = report.statuscode;
                    if (typeof id !== "string") return;
                    reportsByDate[dateKey] = {
                        id,
                        statusReason: typeof statusReason === "string" ? statusReason : "",
                        statusCode: typeof statusCode === "number" ? statusCode : null,
                        startHour: getTimeOfDay(report.sec_horainicio),
                        endHour: getTimeOfDay(report.sec_horafin)
                    };
                });

                results.entities.forEach(e => {
                    const id: unknown = e.msdyn_timeentryid;
                    if (typeof id !== "string" || typeof e.msdyn_start !== "string" || typeof e.msdyn_end !== "string") {
                        return;
                    }

                    const start = new Date(e.msdyn_start);
                    const end = new Date(e.msdyn_end);
                    const dateKey = getLocalDateKey(start);
                    const formattedType: unknown = e["msdyn_type@OData.Community.Display.V1.FormattedValue"];
                    const description: unknown = e.msdyn_description;
                    
                    const entry: ITimeEntry = {
                        id,
                        start,
                        end,
                        typeFormatted: typeof formattedType === "string" ? formattedType : "",
                        description: typeof description === "string" ? description : "",
                        hasOt: e._msdyn_workorder_value !== null && e._msdyn_workorder_value !== undefined
                    };
                    
                    if (grouped[dateKey]) {
                        grouped[dateKey].push(entry);
                    }
                });

                setTimeEntries(grouped);
                setDailyReports(reportsByDate);
            } catch (err: unknown) {
                setErrorMsg("Error cargando el parte horario: " + getErrorMessage(err));
            } finally {
                setIsLoadingEntries(false);
            }
        };

        void loadWeekEntries();
    }, [selectedResource, currentWeekStart, context, refreshKey]);

    const approveAllSentReports = async () => {
        if (isApproving || sentReports.length === 0) return;

        setIsApproving(true);
        setErrorMsg("");
        try {
            const updateResults = await Promise.allSettled(sentReports.map(report =>
                context.webAPI.updateRecord("sec_partediario", report.id, { statuscode: APPROVED_STATUS })
            ));
            const failures = updateResults.filter(result => result.status === "rejected");
            setRefreshKey(key => key + 1);

            if (failures.length > 0) {
                const details = failures
                    .map(result => result.status === "rejected" ? getErrorMessage(result.reason) : "")
                    .join("; ");
                setErrorMsg(`Error aprobando ${failures.length} de ${sentReports.length} partes: ${details}`);
            }
        } catch (err: unknown) {
            setErrorMsg("Error aprobando los partes enviados: " + getErrorMessage(err));
        } finally {
            setIsApproving(false);
        }
    };

    const updateReportStatus = async (report: IDailyReport, action: "approve" | "reject") => {
        if (isLoadingEntries || updatingReportIds.includes(report.id)) return;

        const actionLabel = action === "approve" ? "aprobando" : "rechazando";
        setUpdatingReportIds(ids => ids.includes(report.id) ? ids : [...ids, report.id]);
        setErrorMsg("");
        try {
            const targetStatus = action === "approve" ? APPROVED_STATUS : REJECTED_STATUS;
            await context.webAPI.updateRecord("sec_partediario", report.id, { statuscode: targetStatus });
            setRefreshKey(key => key + 1);
        } catch (err: unknown) {
            setErrorMsg(`Error ${actionLabel} el parte diario: ${getErrorMessage(err)}`);
        } finally {
            setUpdatingReportIds(ids => ids.filter(id => id !== report.id));
        }
    };

    // Función auxiliar para colores/iconos emulando ParteDiario
    const getVisualProperties = (entry: ITimeEntry) => {
        const nameLower = entry.typeFormatted.toLowerCase();
        const descLower = entry.description.toLowerCase();
        let bg = "#42638C"; // Default trabajo
        let icon = "🛠️";

        if (nameLower.includes("festivo") || descLower.includes("festivo")) {
            bg = "#9B59B6"; icon = "🎉";
        } else if (descLower.includes("sin asignación") || descLower.includes("sin asignacion")) {
            bg = "#A67B5B"; icon = "⏳";
        } else if (nameLower.includes("viaje")) {
            bg = "#7fba00"; icon = "🚗";
        } else if (nameLower.includes("descanso") || descLower.includes("almuerzo") || descLower.includes("comida")) {
            bg = "#C68B2C"; icon = descLower.includes("almuerzo") ? "🍔" : "☕";
        } else if (nameLower.includes("vacacion") || nameLower.includes("ausencia")) {
            bg = "#641432"; icon = "🌴";
        } else if (!entry.hasOt) {
            bg = "#7DA8D8"; icon = "🛠️"; // Trabajo manual
        }

        return { bg, icon };
    };

    // Renderizado del calendario diario
    const renderDayColumn = (dateKey: string, dateObj: Date) => {
        const dayEntries = timeEntries[dateKey] || [];
        const dailyReport = dailyReports[dateKey];
        const dayName = dateObj.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric' });
        const statusClassName = getStatusClassName(dailyReport?.statusReason || "");
        const canUpdateReport = Boolean(dailyReport && isSentStatus(dailyReport.statusCode));
        const isUpdatingReport = Boolean(dailyReport && updatingReportIds.includes(dailyReport.id));
        
        return (
            <div className="ach-col" key={dateKey}>
                <div className="ach-col-sticky-header">
                    <div className="ach-col-header">{dayName.charAt(0).toUpperCase() + dayName.slice(1)}</div>
                    <div className={`ach-day-status ${statusClassName}`} title={dailyReport?.statusReason || undefined}>
                        {dailyReport ? dailyReport.statusReason || "Estado no disponible" : "Sin parte generado"}
                    </div>
                    {canUpdateReport && dailyReport && (
                        <div className="ach-day-actions">
                            <button
                                type="button"
                                className="ach-day-action ach-day-action--reject"
                                onClick={() => void updateReportStatus(dailyReport, "reject")}
                                disabled={isLoadingEntries || isApproving || isUpdatingReport}
                                aria-label={`Rechazar parte del ${dayName}`}
                            >
                                Rechazar
                            </button>
                            <button
                                type="button"
                                className="ach-day-action ach-day-action--approve"
                                onClick={() => void updateReportStatus(dailyReport, "approve")}
                                disabled={isLoadingEntries || isApproving || isUpdatingReport}
                                aria-label={`Aprobar parte del ${dayName}`}
                            >
                                Aprobar
                            </button>
                        </div>
                    )}
                </div>
                
                {!dailyReport ? (
                    <div className="ach-empty-state">
                        <Icon iconName="Calendar" className="ach-empty-icon" />
                        <Text>Sin parte generado</Text>
                    </div>
                ) : (
                    <div className="ach-timeline">
                        {dailyReport.startHour !== null && (
                            <div className="ach-work-marker" style={{ top: `${(dailyReport.startHour / 24) * 100}%` }}>
                                <span>Inicio {formatTimeOfDay(dailyReport.startHour)}</span>
                            </div>
                        )}
                        {dailyReport.endHour !== null && (
                            <div className="ach-work-marker ach-work-marker-end" style={{ top: `${(dailyReport.endHour / 24) * 100}%` }}>
                                <span>Fin {formatTimeOfDay(dailyReport.endHour)}</span>
                            </div>
                        )}
                        
                        {/* Bloques de entradas */}
                        {dayEntries.map(e => {
                            const startDec = e.start.getHours() + (e.start.getMinutes() / 60);
                            const endDec = e.end.getHours() + (e.end.getMinutes() / 60);
                            const top = (startDec / 24) * 100;
                            const height = ((endDec - startDec) / 24) * 100;
                            const { bg, icon } = getVisualProperties(e);
                            const timeStr = `${String(e.start.getHours()).padStart(2,'0')}:${String(e.start.getMinutes()).padStart(2,'0')} - ${String(e.end.getHours()).padStart(2,'0')}:${String(e.end.getMinutes()).padStart(2,'0')}`;

                            return (
                                <div key={e.id} className="ach-entry" style={{ top: `${top}%`, height: `${height}%`, backgroundColor: bg }}>
                                    <div className="ach-entry-inner">
                                        <span className="ach-entry-icon">{icon}</span>
                                        <span className="ach-entry-time">{timeStr}</span>
                                        {height > 3 && <span className="ach-entry-desc">{e.description || e.typeFormatted}</span>}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        );
    };

    const getWeekRangeLabel = () => {
        const sunday = new Date(currentWeekStart);
        sunday.setDate(sunday.getDate() + 6);
        return `Semana del ${currentWeekStart.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })} al ${sunday.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}`;
    };

    return (
        <div
            className="ach-container"
            style={{
                width: width > 0 ? width : "100%",
                height: height > 0 ? height : "100%"
            }}
        >
            {/* Panel Izquierdo: Lista de Recursos */}
            <div className="ach-sidebar">
                <Text variant="large" className="ach-sidebar-title">Mis Recursos</Text>
                <div className="ach-resource-search">
                    <Icon iconName="Search" className="ach-resource-search-icon" />
                    <input
                        type="search"
                        className="ach-resource-search-input"
                        value={resourceSearch}
                        onChange={event => setResourceSearch(event.currentTarget.value)}
                        placeholder="Buscar recurso..."
                        aria-label="Buscar recursos"
                    />
                </div>
                {isLoadingResources ? (
                    <Spinner size={SpinnerSize.medium} />
                ) : (
                    <div className="ach-resource-list">
                        {resources.length === 0 ? (
                            <Text className="ach-no-data">No hay recursos bajo tu supervisión.</Text>
                        ) : filteredResources.length === 0 ? (
                            <Text className="ach-no-data">No se encontraron recursos.</Text>
                        ) : (
                            filteredResources.map(r => (
                                <div 
                                    key={r.id} 
                                    className={`ach-resource-item ${selectedResource?.id === r.id ? 'active' : ''}`}
                                    onClick={() => setSelectedResource(r)}
                                >
                                    <Icon iconName="Contact" className="ach-res-icon"/> {r.name}
                                </div>
                            ))
                        )}
                    </div>
                )}
            </div>

            {/* Panel Derecho: Calendario Semanal */}
            <div className="ach-main">
                {errorMsg && <div className="ach-error">{errorMsg}</div>}
                
                <div className="ach-header">
                    <Stack horizontal verticalAlign="center" tokens={{ childrenGap: 10 }}>
                        <Text variant="xLarge" style={{ fontWeight: 600 }}>Aprobaciones</Text>
                        {selectedResource && <Text variant="large" style={{ color: '#0078d4' }}>| {selectedResource.name}</Text>}
                    </Stack>

                    <Stack horizontal verticalAlign="center" tokens={{ childrenGap: 8 }}>
                        <PrimaryButton
                            text={isApproving ? "Aprobando..." : "Aprobar todo"}
                            onClick={() => void approveAllSentReports()}
                            disabled={isApproving || isLoadingEntries || updatingReportIds.length > 0 || sentReports.length === 0}
                        />
                    </Stack>
                    <Stack horizontal verticalAlign="center" tokens={{ childrenGap: 2 }} className="ach-week-selector">
                        <IconButton className="ach-week-button" iconProps={{ iconName: 'ChevronLeft' }} title="Semana anterior" ariaLabel="Semana anterior" onClick={() => changeWeek(-1)} />
                        <Text className="ach-week-label">
                            {getWeekRangeLabel()}
                        </Text>
                        <IconButton className="ach-week-button" iconProps={{ iconName: 'ChevronRight' }} title="Semana siguiente" ariaLabel="Semana siguiente" onClick={() => changeWeek(1)} />
                        <span className="ach-zoom-controls" aria-label="Zoom de la línea de tiempo">
                            <IconButton
                                iconProps={{ iconName: 'ZoomOut' }}
                                title="Reducir zoom"
                                ariaLabel="Reducir zoom"
                                disabled={timelineZoom <= 60}
                                onClick={() => changeTimelineZoom(-10)}
                            />
                            <Text className="ach-zoom-level">{timelineZoom}%</Text>
                            <IconButton
                                iconProps={{ iconName: 'ZoomIn' }}
                                title="Aumentar zoom"
                                ariaLabel="Aumentar zoom"
                                disabled={timelineZoom >= 160}
                                onClick={() => changeTimelineZoom(10)}
                            />
                        </span>
                    </Stack>
                </div>

                <div className="ach-grid-container" ref={gridContainerRef}>
                    {isLoadingEntries ? (
                        <div className="ach-loading-overlay"><Spinner size={SpinnerSize.large} label="Cargando partes..." /></div>
                    ) : null}
                    
                    <div
                        className="ach-grid"
                        style={{
                            height: availableTimelineHeight > 0
                                ? `${availableTimelineHeight * timelineZoom / 100}px`
                                : "100%"
                        }}
                    >
                        {renderTimeAxis("left")}
                        {Array.from({ length: 7 }).map((_, i) => {
                            const d = new Date(currentWeekStart);
                            d.setDate(d.getDate() + i);
                            return renderDayColumn(getLocalDateKey(d), d);
                        })}
                        {renderTimeAxis("right")}
                    </div>
                </div>
            </div>

            {/* Etiqueta de versión (gris, abajo derecha) */}
            <div className="ach-version-tag">{VERSION}</div>
        </div>
    );
};