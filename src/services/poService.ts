import { collection, query, orderBy, limit, getDocs } from 'firebase/firestore';
import { db } from '../firebase';

export const poService = {
  getNextPONumber: async (): Promise<number> => {
    try {
      const poRef = collection(db, 'purchase-orders');
      const q = query(poRef, orderBy('number', 'desc'), limit(1));
      const querySnapshot = await getDocs(q);
      
      if (querySnapshot.empty) {
        return 1001;
      }
      
      const lastPO = querySnapshot.docs[0].data();
      const lastNumber = Number(lastPO.number);
      
      if (isNaN(lastNumber)) {
        return 1001;
      }
      
      return lastNumber + 1;
    } catch (error) {
      console.error('Erro ao gerar próximo número de OC:', error);
      // Fallback para um número aleatório se falhar a consulta, para não travar a criação
      return Math.floor(Math.random() * 9000) + 10000;
    }
  }
};
