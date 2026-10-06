<script setup lang="ts">defineProps<{ level: number }>();</script>
<template><div class="wave-meter" aria-label="实时音量"><i v-for="n in 24" :key="n" :style="{height:`${18 + ((n*17)%48) * (.25 + level)}px`}"></i></div></template>
