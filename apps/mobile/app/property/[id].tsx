import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useProperty } from '../../src/hooks/useProperties';

const GRADE_COLOR: Record<string, string> = { A:'#27AE60', B:'#2ECC71', C:'#F39C12', D:'#E67E22', F:'#E74C3C' };
const TYPE_LABEL: Record<string,string> = { RESIDENTIAL:'Residencial', COMMERCE:'Comercial', CLINIC:'Clínica', MIXED:'Misto' };
const CATEGORY_LABEL: Record<string,string> = {
  ELEVATOR:'Elevadores', ELECTRICAL:'Elétrico', HYDRAULIC:'Hidráulico',
  FIRE_SYSTEM:'PPCI', STRUCTURE:'Estrutura', HVAC:'Climatização',
  FACADE:'Fachada', GENERATOR:'Gerador', OTHER:'Outros',
};
const STATUS_COLOR: Record<string,string> = { OPERATIONAL:'#27AE60', MAINTENANCE:'#F39C12', DECOMMISSIONED:'#95A5A6', UNKNOWN:'#BDC3C7' };
const STATUS_LABEL: Record<string,string> = { OPERATIONAL:'Operacional', MAINTENANCE:'Em manutenção', DECOMMISSIONED:'Desativado', UNKNOWN:'Desconhecido' };

export default function PropertyDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: property, isLoading, isError } = useProperty(id ?? '');

  if (isLoading) return (
    <>
      <Stack.Screen options={{ title:'Imóvel', headerStyle:{ backgroundColor:'#1E3A5F' }, headerTintColor:'#fff' }} />
      <View style={s.center}><ActivityIndicator size="large" color="#1E3A5F" /></View>
    </>
  );

  if (isError || !property) return (
    <>
      <Stack.Screen options={{ title:'Imóvel', headerStyle:{ backgroundColor:'#1E3A5F' }, headerTintColor:'#fff' }} />
      <View style={s.center}><Text style={s.errTxt}>Erro ao carregar imóvel.</Text></View>
    </>
  );

  const hs = property.healthScore;
  const gradeColor = hs ? (GRADE_COLOR[hs.grade] ?? '#6B7E97') : '#6B7E97';

  return (
    <>
      <Stack.Screen options={{
        title: property.name,
        headerStyle:{ backgroundColor:'#1E3A5F' },
        headerTintColor:'#fff',
        headerTitleStyle:{ fontWeight:'700' },
      }} />
      <ScrollView style={s.page} contentContainerStyle={{ padding:16, paddingBottom:40 }}>

        {/* Health Score */}
        {hs && (
          <View style={s.scoreCard}>
            <View style={s.scoreLeft}>
              <Text style={s.scoreLabel}>Health Score</Text>
              <Text style={[s.scoreGrade, { color: gradeColor }]}>{hs.grade}</Text>
            </View>
            <View style={s.scoreRight}>
              <Text style={s.scoreNum}>{hs.score}<Text style={s.scoreOf}>/100</Text></Text>
              {hs.alerts?.length > 0 && (
                <Text style={s.alertBadge}>⚠️ {hs.alerts.length} alerta(s)</Text>
              )}
            </View>
          </View>
        )}

        {/* Info */}
        <View style={s.card}>
          <Text style={s.cardTitle}>Informações</Text>
          <Row label="Tipo" value={TYPE_LABEL[property.type] ?? property.type} />
          <Row label="Endereço" value={property.street + ', ' + property.number + ' — ' + property.neighborhood} />
          <Row label="Cidade" value={property.city + '/' + property.state} />
          {property.floors && <Row label="Andares" value={String(property.floors)} />}
          {property.units && <Row label="Unidades" value={String(property.units)} />}
          {property.constructionYear && <Row label="Ano de construção" value={String(property.constructionYear)} />}
          {property.totalArea && <Row label="Área total" value={property.totalArea + ' m²'} />}
        </View>

        {/* Ativos */}
        {property.assets?.length > 0 && (
          <View style={s.card}>
            <Text style={s.cardTitle}>Ativos ({property.assets.length})</Text>
            {property.assets.map(asset => {
              const statusColor = STATUS_COLOR[asset.status] ?? '#BDC3C7';
              return (
                <View key={asset.id} style={s.assetRow}>
                  <View style={{ flex:1 }}>
                    <Text style={s.assetName}>{asset.name}</Text>
                    <Text style={s.assetSub}>{CATEGORY_LABEL[asset.category] ?? asset.category}{asset.brand ? ' · ' + asset.brand : ''}{asset.model ? ' ' + asset.model : ''}</Text>
                    {asset.applicableNorms?.length > 0 && (
                      <Text style={s.norm}>{asset.applicableNorms.map(n => n.replace('_', ' ')).join(', ')}</Text>
                    )}
                  </View>
                  <View style={[s.statusDot, { backgroundColor: statusColor + '33', borderColor: statusColor }]}>
                    <Text style={[s.statusTxt, { color: statusColor }]}>{STATUS_LABEL[asset.status] ?? asset.status}</Text>
                  </View>
                </View>
              );
            })}
          </View>
        )}

        {/* Health Score Alerts */}
        {hs?.alerts?.length > 0 && (
          <View style={s.card}>
            <Text style={s.cardTitle}>Alertas</Text>
            {hs.alerts.map((alert, i) => (
              <View key={i} style={s.alertRow}>
                <Text style={s.alertIcon}>⚠️</Text>
                <Text style={s.alertText}>{alert}</Text>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.infoRow}>
      <Text style={s.infoLabel}>{label}</Text>
      <Text style={s.infoValue}>{value}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  page:       { flex:1, backgroundColor:'#F0F4F8' },
  center:     { flex:1, justifyContent:'center', alignItems:'center' },
  card:       { backgroundColor:'#fff', borderRadius:12, padding:16, marginBottom:12, elevation:2 },
  cardTitle:  { fontSize:14, fontWeight:'700', color:'#6B7E97', marginBottom:12, textTransform:'uppercase', letterSpacing:0.5 },
  scoreCard:  { backgroundColor:'#1E3A5F', borderRadius:12, padding:20, marginBottom:12, flexDirection:'row', justifyContent:'space-between', alignItems:'center' },
  scoreLeft:  { gap:4 },
  scoreLabel: { fontSize:12, color:'#A0B4CC', fontWeight:'600' },
  scoreGrade: { fontSize:40, fontWeight:'700' },
  scoreRight: { alignItems:'flex-end', gap:6 },
  scoreNum:   { fontSize:28, fontWeight:'700', color:'#fff' },
  scoreOf:    { fontSize:16, color:'#A0B4CC' },
  alertBadge: { fontSize:12, color:'#F39C12', fontWeight:'600' },
  infoRow:    { flexDirection:'row', justifyContent:'space-between', paddingVertical:6, borderBottomWidth:1, borderBottomColor:'#F0F4F8' },
  infoLabel:  { fontSize:13, color:'#6B7E97', flex:1 },
  infoValue:  { fontSize:13, color:'#1E3A5F', fontWeight:'500', flex:2, textAlign:'right' },
  assetRow:   { flexDirection:'row', alignItems:'flex-start', paddingVertical:10, borderBottomWidth:1, borderBottomColor:'#F0F4F8', gap:12 },
  assetName:  { fontSize:14, fontWeight:'600', color:'#1E3A5F', marginBottom:2 },
  assetSub:   { fontSize:12, color:'#6B7E97' },
  norm:       { fontSize:11, color:'#A0B4CC', marginTop:2 },
  statusDot:  { borderRadius:8, borderWidth:1, paddingHorizontal:8, paddingVertical:4, alignSelf:'flex-start' },
  statusTxt:  { fontSize:11, fontWeight:'600' },
  alertRow:   { flexDirection:'row', gap:8, paddingVertical:6 },
  alertIcon:  { fontSize:14 },
  alertText:  { fontSize:13, color:'#1E3A5F', flex:1 },
  errTxt:     { color:'#C0392B', fontSize:15 },
});
