import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import interactionPlugin from '@fullcalendar/interaction';
import styles from '../styles/CalendarView.module.css';

const STATUS_COLORS = {
  not_started: '#9e9e9e',
  in_progress: '#2196f3',
  done: '#4caf50',
};

export default function CalendarView({ tasks, onDateClick, onTaskClick }) {
  const events = tasks.map((task) => ({
    id: task.id,
    title: task.title,
    date: task.date,
    backgroundColor: STATUS_COLORS[task.status] || '#9e9e9e',
    borderColor: STATUS_COLORS[task.status] || '#9e9e9e',
    extendedProps: { task },
  }));

  return (
    <div className={styles.container}>
      <FullCalendar
        plugins={[dayGridPlugin, interactionPlugin]}
        initialView="dayGridMonth"
        locale="pt-br"
        headerToolbar={{
          left: 'prev,next today',
          center: 'title',
          right: '',
        }}
        events={events}
        dateClick={(info) => onDateClick(info.dateStr)}
        eventClick={(info) => {
          info.jsEvent.preventDefault();
          onTaskClick(info.event.extendedProps.task);
        }}
        height="auto"
        dayMaxEvents={3}
        buttonText={{
          today: 'Hoje',
        }}
      />
    </div>
  );
}
