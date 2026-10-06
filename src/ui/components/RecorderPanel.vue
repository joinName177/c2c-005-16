<script setup lang="ts">
import WaveformMeter from './WaveformMeter.vue';
defineProps<{ recording:boolean; level:number }>();
const emit=defineEmits<{record:[];stop:[];import:[file:File]}>();
</script>
<template><section class="recorder-panel"><div class="time-code"><b>{{ recording?'REC':'READY' }}</b><strong>{{ recording?'00:06':'00:00' }}</strong><span>00:10 MAX</span></div><WaveformMeter :level="level"/><div class="recorder-actions"><button v-if="!recording" data-testid="record" class="record-button" type="button" @click="emit('record')"><i></i>开始录音</button><button v-else data-testid="stop" class="record-button stop" type="button" @click="emit('stop')">■ 结束录音</button><label>导入音频<input type="file" accept="audio/*" @change="($event.target as HTMLInputElement).files?.[0] && emit('import', ($event.target as HTMLInputElement).files![0])"></label></div><p>录音只在本机处理，不会上传。建议靠近麦克风，以正常语速说一句话。</p></section></template>
