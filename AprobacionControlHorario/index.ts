import { IInputs, IOutputs } from "./generated/ManifestTypes";
import * as React from "react";
import { AprobacionControlHorarioApp, IAppProps } from "./AprobacionControlHorarioApp";

export class AprobacionControlHorario implements ComponentFramework.ReactControl<IInputs, IOutputs> {
    private _notifyOutputChanged: () => void;
    private _context: ComponentFramework.Context<IInputs>;

    public init(context: ComponentFramework.Context<IInputs>, notifyOutputChanged: () => void): void {
        context.mode.trackContainerResize(true);
        this._notifyOutputChanged = notifyOutputChanged;
        this._context = context;
    }

    public updateView(context: ComponentFramework.Context<IInputs>): React.ReactElement {
        this._context = context;
        
        // Obtenemos la región seleccionada en los parámetros (1: España, 2: Portugal, 3: Latam)
        const region = context.parameters.sec_region.raw || "1";

        const props: IAppProps = {
            context: this._context,
            region: region,
            width: context.mode.allocatedWidth,
            height: context.mode.allocatedHeight
        };

        return React.createElement(AprobacionControlHorarioApp, props);
    }

    public getOutputs(): IOutputs {
        return {};
    }

    public destroy(): void {
        // Limpieza si fuera necesario
    }
}