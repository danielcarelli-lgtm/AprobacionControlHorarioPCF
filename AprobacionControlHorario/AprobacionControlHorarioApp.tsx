import * as React from 'react';
import { useState, useEffect, useRef } from 'react';
import { IInputs } from "./generated/ManifestTypes";
import { Spinner, SpinnerSize, Icon, Stack, Text, IconButton, PrimaryButton } from '@fluentui/react';
import enUS from "./strings/en-US";
import esES from "./strings/es-ES";
import ptPT from "./strings/pt-PT";
import { ITranslations } from "./strings/types";

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
    clientName: string;
    hasOt: boolean;
}

interface IDailyReport {
    id: string;
    statusReason: string;
    statusCode: number | null;
    startHour: number | null;
    endHour: number | null;
}

const VERSION = "v1.0.12";
const DRAFT_STATUS = 1;
const INACTIVE_STATUS = 2;
const SENT_STATUS = 909540001;
const APPROVED_STATUS = 909540002;
const REJECTED_STATUS = 909540003;
const MAX_TIMELINE_ZOOM = 300;

const messages: Record<Locale, ITranslations> = {
    "es-ES": esES,
    "pt-PT": ptPT,
    "en-US": enUS
};

type MessageKey = keyof ITranslations;
type Locale = "es-ES" | "pt-PT" | "en-US";

const translate = (locale: Locale, key: MessageKey): string => messages[locale][key];

const getLocale = (languageId: number): Locale => {
    if (languageId === 2070) return "pt-PT";
    if (languageId === 1033) return "en-US";
    return "es-ES";
};

const interpolate = (template: string, values: Record<string, string>): string =>
    template.replace(/\{([^}]+)\}/g, (_, key: string) => values[key] ?? `{${key}}`);

const getRecord = (value: unknown): Record<string, unknown> | null =>
    typeof value === "object" && value !== null ? value as Record<string, unknown> : null;

const isSentStatus = (statusCode: number | null): boolean => statusCode === SENT_STATUS;

const getLocalDateKey = (date: Date): string =>
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

const getStatusClassName = (statusCode: number | null): string => {
    if (statusCode === REJECTED_STATUS) return "ach-day-status--rejected";
    if (statusCode === SENT_STATUS) return "ach-day-status--sent";
    if (statusCode === APPROVED_STATUS) return "ach-day-status--approved";
    if (statusCode === DRAFT_STATUS || statusCode === INACTIVE_STATUS) return "ach-day-status--pending";
    return "ach-day-status--default";
};

const getReportStatusLabel = (statusCode: number | null, fallback: string, locale: Locale): string => {
    if (statusCode === DRAFT_STATUS) return messages[locale].reportStatusDraft;
    if (statusCode === INACTIVE_STATUS) return messages[locale].reportStatusInactive;
    if (statusCode === SENT_STATUS) return messages[locale].reportStatusSent;
    if (statusCode === APPROVED_STATUS) return messages[locale].reportStatusApproved;
    if (statusCode === REJECTED_STATUS) return messages[locale].reportStatusRejected;
    return fallback || messages[locale].unknownStatus;
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

const formatDuration = (minutes: number, locale: Locale): string => {
    const totalMinutes = Math.round(minutes);
    const hours = Math.floor(totalMinutes / 60);
    const remainingMinutes = totalMinutes % 60;
    if (locale === "en-US") {
        return `${hours} ${messages[locale].hoursUnit}${hours === 1 ? "" : "s"}${remainingMinutes > 0 ? ` ${remainingMinutes} ${messages[locale].minutesShort}` : ""}`;
    }
    return `${hours} ${messages[locale].hoursShort}${remainingMinutes > 0 ? ` ${remainingMinutes} ${messages[locale].minutesShort}` : ""}`;
};

const getDayProgress = (
    entries: ITimeEntry[],
    startHour: number | null,
    endHour: number | null,
    locale: Locale
): string => {
    if (startHour === null || endHour === null || endHour <= startHour) {
        return messages[locale].dailyGoalUnavailable;
    }

    const targetMinutes = (endHour - startHour) * 60;
    const workedMinutes = entries.reduce((total, entry) =>
        total + Math.max(0, entry.end.getTime() - entry.start.getTime()) / 60000, 0
    );
    const differenceMinutes = Math.round(targetMinutes - workedMinutes);

    if (differenceMinutes > 0) {
        return interpolate(messages[locale].remaining, { duration: formatDuration(differenceMinutes, locale) });
    }
    if (differenceMinutes < 0) {
        return interpolate(messages[locale].exceeded, { duration: formatDuration(Math.abs(differenceMinutes), locale) });
    }
    return messages[locale].objectiveMet;
};

const renderTimeAxis = (side: "left" | "right", locale: Locale) => (
    <div className={`ach-axis ach-axis--${side}`} aria-hidden="true">
        {[0, 4, 8, 12, 16, 20, 24].map(hour => (
            <div
                key={hour}
                className="ach-tick"
                title={`${translate(locale, "timeAxis")} ${String(hour).padStart(2, "0")}:00`}
                style={{ top: `${(hour / 24) * 100}%` }}
            >
                {String(hour).padStart(2, "0")}:00
            </div>
        ))}
    </div>
);

const getErrorMessage = (error: unknown): string =>
    error instanceof Error ? error.message : String(error);

export const AprobacionControlHorarioApp: React.FC<IAppProps> = ({ context, region, width, height }) => {
    const locale = getLocale(context.userSettings.languageId);
    const t = (key: MessageKey): string => translate(locale, key);
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
    const normalizedResourceSearch = resourceSearch.trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase(locale);
    const filteredResources = resources.filter(resource =>
        resource.name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase(locale).includes(normalizedResourceSearch)
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
        setTimelineZoom(zoom => Math.min(MAX_TIMELINE_ZOOM, Math.max(60, zoom + offset)));
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
                setErrorMsg(translate(locale, "resourceLoadError") + getErrorMessage(err));
            } finally {
                setIsLoadingResources(false);
            }
        };

        void loadResources();
    }, [context, region, locale]);

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

                const workOrderIds = Array.from(new Set(results.entities
                    .map(entry => {
                        const id: unknown = entry._msdyn_workorder_value;
                        return id;
                    })
                    .filter((id): id is string => typeof id === "string" && id.length > 0)
                    .map(id => id.replace(/[{}]/g, "").toLowerCase())));
                const workOrderClientNames: Record<string, string> = {};
                const workOrderIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

                for (const id of workOrderIds) {
                    if (!workOrderIdPattern.test(id)) {
                        throw new Error(translate(locale, "workOrderIdInvalid"));
                    }
                }

                if (workOrderIds.length > 0) {
                    const workOrderFilter = workOrderIds
                        .map(id => `msdyn_workorderid eq ${id}`)
                        .join(" or ");
                    const workOrders = await context.webAPI.retrieveMultipleRecords(
                        "msdyn_workorder",
                        `?$select=msdyn_workorderid,_msdyn_serviceaccount_value&$filter=${workOrderFilter}`
                    );
                    workOrders.entities.forEach(workOrder => {
                        const id: unknown = workOrder.msdyn_workorderid;
                        const clientName: unknown = workOrder["_msdyn_serviceaccount_value@OData.Community.Display.V1.FormattedValue"];
                        if (typeof id === "string" && typeof clientName === "string") {
                            workOrderClientNames[id.toLowerCase()] = clientName;
                        }
                    });
                }
                
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
                        clientName: typeof e._msdyn_workorder_value === "string"
                            ? workOrderClientNames[e._msdyn_workorder_value.replace(/[{}]/g, "").toLowerCase()] || translate(locale, "clientUnavailable")
                            : translate(locale, "clientUnavailable"),
                        hasOt: e._msdyn_workorder_value !== null && e._msdyn_workorder_value !== undefined
                    };
                    
                    if (grouped[dateKey]) {
                        grouped[dateKey].push(entry);
                    }
                });

                setTimeEntries(grouped);
                setDailyReports(reportsByDate);
            } catch (err: unknown) {
                setErrorMsg(translate(locale, "entriesLoadError") + getErrorMessage(err));
            } finally {
                setIsLoadingEntries(false);
            }
        };

        void loadWeekEntries();
    }, [selectedResource, currentWeekStart, context, refreshKey, locale]);

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
                setErrorMsg(interpolate(t("approvePartialError"), {
                    failed: String(failures.length),
                    total: String(sentReports.length),
                    details
                }));
            }
        } catch (err: unknown) {
            setErrorMsg(t("approveError") + getErrorMessage(err));
        } finally {
            setIsApproving(false);
        }
    };

    const updateReportStatus = async (report: IDailyReport, action: "approve" | "reject") => {
        if (isLoadingEntries || updatingReportIds.includes(report.id)) return;

        setUpdatingReportIds(ids => ids.includes(report.id) ? ids : [...ids, report.id]);
        setErrorMsg("");
        try {
            const targetStatus = action === "approve" ? APPROVED_STATUS : REJECTED_STATUS;
            await context.webAPI.updateRecord("sec_partediario", report.id, { statuscode: targetStatus });
            setRefreshKey(key => key + 1);
        } catch (err: unknown) {
            setErrorMsg((action === "approve" ? t("approveSingleError") : t("rejectError")) + getErrorMessage(err));
        } finally {
            setUpdatingReportIds(ids => ids.filter(id => id !== report.id));
        }
    };

    const openDailyReport = (report: IDailyReport) => {
        void context.navigation.openForm({
            entityName: "sec_partediario",
            entityId: report.id,
            openInNewWindow: true
        }).catch((err: unknown) => {
            setErrorMsg(t("openReportError") + getErrorMessage(err));
        });
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
        const dayName = dateObj.toLocaleDateString(locale, { weekday: 'long', day: 'numeric' });
        const statusClassName = getStatusClassName(dailyReport?.statusCode ?? null);
        const canUpdateReport = Boolean(dailyReport && isSentStatus(dailyReport.statusCode));
        const isUpdatingReport = Boolean(dailyReport && updatingReportIds.includes(dailyReport.id));
        
        return (
            <div className="ach-col" key={dateKey}>
                <div className="ach-col-sticky-header">
                    <div className="ach-col-header" title={dayName}>
                        {dayName.charAt(0).toLocaleUpperCase(locale) + dayName.slice(1)}
                    </div>
                    {dailyReport ? (
                        <button
                            type="button"
                            className={`ach-day-status ${statusClassName}`}
                            title={t("openDailyReport")}
                            onClick={() => openDailyReport(dailyReport)}
                        >
                            <span>{getReportStatusLabel(dailyReport.statusCode, dailyReport.statusReason, locale)}</span>
                            <span className="ach-day-progress" title={t("progressTooltip")}>
                                {getDayProgress(dayEntries, dailyReport.startHour, dailyReport.endHour, locale)}
                            </span>
                        </button>
                    ) : (
                        <div className={`ach-day-status ${statusClassName}`} title={t("noDailyReportTooltip")}>
                            {t("noDailyReport")}
                        </div>
                    )}
                    {canUpdateReport && dailyReport && (
                        <div className="ach-day-actions">
                            <button
                                type="button"
                                className="ach-day-action ach-day-action--reject"
                                title={interpolate(t("rejectReportTooltip"), { day: dayName })}
                                onClick={() => void updateReportStatus(dailyReport, "reject")}
                                disabled={isLoadingEntries || isApproving || isUpdatingReport}
                                aria-label={interpolate(t("rejectReportTooltip"), { day: dayName })}
                            >
                                {t("rejectReport")}
                            </button>
                            <button
                                type="button"
                                className="ach-day-action ach-day-action--approve"
                                title={interpolate(t("approveReportTooltip"), { day: dayName })}
                                onClick={() => void updateReportStatus(dailyReport, "approve")}
                                disabled={isLoadingEntries || isApproving || isUpdatingReport}
                                aria-label={interpolate(t("approveReportTooltip"), { day: dayName })}
                            >
                                {t("approveReport")}
                            </button>
                        </div>
                    )}
                </div>
                
                {!dailyReport ? (
                    <div className="ach-empty-state">
                        <Icon iconName="Calendar" className="ach-empty-icon" />
                        <Text title={t("noDailyReportTooltip")}>{t("noDailyReport")}</Text>
                    </div>
                ) : (
                    <div className="ach-timeline">
                        {dailyReport.startHour !== null && (
                            <div className="ach-work-marker" style={{ top: `${(dailyReport.startHour / 24) * 100}%` }}>
                                <span title={`${t("start")} ${formatTimeOfDay(dailyReport.startHour)}`}>
                                    {t("start")} {formatTimeOfDay(dailyReport.startHour)}
                                </span>
                            </div>
                        )}
                        {dailyReport.endHour !== null && (
                            <div className="ach-work-marker ach-work-marker-end" style={{ top: `${(dailyReport.endHour / 24) * 100}%` }}>
                                <span title={`${t("end")} ${formatTimeOfDay(dailyReport.endHour)}`}>
                                    {t("end")} {formatTimeOfDay(dailyReport.endHour)}
                                </span>
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
                                <div
                                    key={e.id}
                                    className="ach-entry"
                                    title={interpolate(t("entryTooltip"), {
                                        type: e.typeFormatted,
                                        time: timeStr,
                                        client: e.clientName
                                    })}
                                    style={{ top: `${top}%`, height: `${height}%`, backgroundColor: bg }}
                                >
                                    <div className="ach-entry-inner">
                                        <span className="ach-entry-icon">{icon}</span>
                                        <span className="ach-entry-time">{timeStr}</span>
                                        <span className="ach-entry-client" title={e.clientName}>{e.clientName}</span>
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
        return interpolate(t("weekRange"), {
            start: currentWeekStart.toLocaleDateString(locale, { day: 'numeric', month: 'short' }),
            end: sunday.toLocaleDateString(locale, { day: 'numeric', month: 'short' })
        });
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
                <Text variant="large" className="ach-sidebar-title" title={t("resourcesTitle")}>
                    {t("resourcesTitle")}
                </Text>
                <div className="ach-resource-search" title={t("resourceSearchTooltip")}>
                    <Icon iconName="Search" className="ach-resource-search-icon" aria-hidden="true" />
                    <input
                        type="search"
                        className="ach-resource-search-input"
                        value={resourceSearch}
                        onChange={event => setResourceSearch(event.currentTarget.value)}
                        placeholder={t("searchResource")}
                        aria-label={t("searchResources")}
                        title={t("resourceSearchTooltip")}
                    />
                </div>
                {isLoadingResources ? (
                    <Spinner size={SpinnerSize.medium} label={t("loadingResources")} />
                ) : (
                    <div className="ach-resource-list">
                        {resources.length === 0 ? (
                            <Text className="ach-no-data">{t("noResources")}</Text>
                        ) : filteredResources.length === 0 ? (
                            <Text className="ach-no-data">{t("noResourcesFound")}</Text>
                        ) : (
                            filteredResources.map(r => (
                                <div 
                                    key={r.id} 
                                    className={`ach-resource-item ${selectedResource?.id === r.id ? 'active' : ''}`}
                                    title={interpolate(t("resourceTooltip"), { resource: r.name })}
                                    role="button"
                                    tabIndex={0}
                                    onClick={() => setSelectedResource(r)}
                                    onKeyDown={event => {
                                        if (event.key === "Enter" || event.key === " ") {
                                            event.preventDefault();
                                            setSelectedResource(r);
                                        }
                                    }}
                                >
                                    <Icon iconName="Contact" className="ach-res-icon" aria-hidden="true"/> {r.name}
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
                        <Text variant="xLarge" style={{ fontWeight: 600 }} title={t("approvalsTitle")}>
                            {t("approvalsTitle")}
                        </Text>
                        {selectedResource && (
                            <Text variant="large" style={{ color: '#0078d4' }} title={selectedResource.name}>
                                | {selectedResource.name}
                            </Text>
                        )}
                    </Stack>

                    <Stack horizontal verticalAlign="center" tokens={{ childrenGap: 8 }}>
                        <PrimaryButton
                            text={isApproving ? t("approving") : t("approveWeek")}
                            title={t("approveWeekTooltip")}
                            onClick={() => void approveAllSentReports()}
                            disabled={isApproving || isLoadingEntries || updatingReportIds.length > 0 || sentReports.length === 0}
                        />
                        <IconButton
                            iconProps={{ iconName: "Refresh" }}
                            title={t("refreshTooltip")}
                            ariaLabel={t("refresh")}
                            disabled={isLoadingEntries || isApproving || updatingReportIds.length > 0 || !selectedResource}
                            onClick={() => {
                                setErrorMsg("");
                                setRefreshKey(key => key + 1);
                            }}
                        />
                    </Stack>
                    <Stack horizontal verticalAlign="center" tokens={{ childrenGap: 2 }} className="ach-week-selector">
                        <IconButton className="ach-week-button" iconProps={{ iconName: 'ChevronLeft' }} title={t("previousWeek")} ariaLabel={t("previousWeek")} onClick={() => changeWeek(-1)} />
                        <Text className="ach-week-label" title={getWeekRangeLabel()}>
                            {getWeekRangeLabel()}
                        </Text>
                        <IconButton className="ach-week-button" iconProps={{ iconName: 'ChevronRight' }} title={t("nextWeek")} ariaLabel={t("nextWeek")} onClick={() => changeWeek(1)} />
                        <span className="ach-zoom-controls" aria-label={t("timelineZoom")} title={t("timelineZoom")}>
                            <IconButton
                                iconProps={{ iconName: 'ZoomOut' }}
                                title={t("zoomOut")}
                                ariaLabel={t("zoomOut")}
                                disabled={timelineZoom <= 60}
                                onClick={() => changeTimelineZoom(-10)}
                            />
                            <Text className="ach-zoom-level" title={`${t("timelineZoom")}: ${timelineZoom}%`}>
                                {timelineZoom}%
                            </Text>
                            <IconButton
                                iconProps={{ iconName: 'ZoomIn' }}
                                title={t("zoomIn")}
                                ariaLabel={t("zoomIn")}
                                disabled={timelineZoom >= MAX_TIMELINE_ZOOM}
                                onClick={() => changeTimelineZoom(10)}
                            />
                        </span>
                    </Stack>
                </div>

                <div className="ach-grid-container" ref={gridContainerRef}>
                    {isLoadingEntries ? (
                        <div className="ach-loading-overlay">
                            <Spinner size={SpinnerSize.large} label={t("loadingReports")} />
                        </div>
                    ) : null}
                    
                    <div
                        className="ach-grid"
                        style={{
                            height: availableTimelineHeight > 0
                                ? `${availableTimelineHeight * timelineZoom / 100}px`
                                : "100%"
                        }}
                    >
                        {renderTimeAxis("left", locale)}
                        {Array.from({ length: 7 }).map((_, i) => {
                            const d = new Date(currentWeekStart);
                            d.setDate(d.getDate() + i);
                            return renderDayColumn(getLocalDateKey(d), d);
                        })}
                        {renderTimeAxis("right", locale)}
                    </div>
                </div>
            </div>

            {/* Etiqueta de versión (gris, abajo derecha) */}
            <div className="ach-version-tag">{VERSION}</div>
        </div>
    );
};