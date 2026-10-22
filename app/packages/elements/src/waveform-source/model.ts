import type { ModelFactory } from "../api";
import { init } from "../shared/modelKit";
import { WaveSourceModel } from "../rail/model";

export const waveformSourceModel: ModelFactory = (el) => init(new WaveSourceModel(el), el);
